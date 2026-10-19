/* eslint-disable react/jsx-wrap-multilines */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import template from '@demo/store/template';
import { useAppSelector } from '@demo/hooks/useAppSelector';
import { useLoading } from '@demo/hooks/useLoading';
import {
  Button,
  ConfigProvider,
  Dropdown,
  Form,
  Input,
  Menu,
  Message,
  Modal,
  PageHeader,
  Select,
} from '@arco-design/web-react';
import { useQuery } from '@demo/hooks/useQuery';
import { useHistory } from 'react-router-dom';
import { cloneDeep, set, isEqual } from 'lodash';
import { Loading } from '@demo/components/loading';
import mjml from 'mjml-browser';
import { copy } from '@demo/utils/clipboard';
import { useEmailModal } from './components/useEmailModal';
import services from '@demo/services';
import { IconMoonFill, IconSunFill } from '@arco-design/web-react/icon';
import { Liquid } from 'liquidjs';
import { saveAs } from 'file-saver';
import {
  BlockAvatarWrapper,
  EmailEditor,
  EmailEditorProvider,
  EmailEditorProviderProps,
  IEmailTemplate,
} from 'easy-email-editor';

import { Stack } from '@demo/components/Stack';
import { pushEvent } from '@demo/utils/pushEvent';
import { FormApi } from 'final-form';
import { UserStorage } from '@demo/utils/user-storage';

import { useCollection } from './components/useCollection';
import { AdvancedType, BasicType, IBlockData, JsonToMjml } from 'easy-email-core';
import {
  BlockMarketManager,
  ExtensionProps,
  MjmlToJson,
  StandardLayout,
} from 'easy-email-extensions';
import { AutoSaveAndRestoreEmail } from '@demo/components/AutoSaveAndRestoreEmail';

// Register external blocks
import './components/CustomBlocks';

import 'easy-email-editor/lib/style.css';
import 'easy-email-extensions/lib/style.css';
import blueTheme from '@arco-themes/react-easy-email-theme/css/arco.css?inline';
import purpleTheme from '@arco-themes/react-easy-email-theme-purple/css/arco.css?inline';
import greenTheme from '@arco-themes/react-easy-email-theme-green/css/arco.css?inline';
import { testMergeTags } from './testMergeTags';
import { useMergeTagsModal } from './components/useMergeTagsModal';

import { useWindowSize } from 'react-use';
import { CustomBlocksType } from './components/CustomBlocks/constants';
import localesData from 'easy-email-localization/locales/locales.json';
import { Uploader } from '@demo/utils/Uploader';
import axios from 'axios';
import enUS from '@arco-design/web-react/es/locale/en-US';

console.log(localesData);
// Theme Block interface for blocks.json from Mautic themes
interface ThemeBlock {
  label: string;
  content: string;  // MJML string
  category: string;
  attributes?: {
    class?: string;
  };
}

// Global state for theme blocks (shared between PostMessageBridge and Editor)
let globalThemeBlocks: Record<string, ThemeBlock> = {};
let themeBlocksUpdateCallback: ((blocks: Record<string, ThemeBlock>) => void) | null = null;



// PostMessage Bridge Component - handles cross-domain communication with Mautic
function PostMessageBridge({
  values,
  restart,
  mergeTags,
  onMergeTagsReceived,
}: {
  values: IEmailTemplate;
  restart: (val: IEmailTemplate) => void;
  mergeTags: Record<string, any>;
  onMergeTagsReceived?: (tags: Record<string, any>) => void;
}) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Get parent origin from URL params
    // Same-origin - parent is always at window.location.origin
    const parentOrigin = window.location.origin;

    console.log("PostMessageBridge: Initialized, parentOrigin:", parentOrigin);

    const handleMessage = (event: MessageEvent) => {
      // Only process messages from parent window (ignore self-messages)
      if (event.source === window) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== 'object' || !data.type) {
        return;
      }

      console.log('PostMessageBridge: Received message:', data.type, data);

      switch (data.type) {
        case 'INIT':
          handleInit(data);
          break;
        case 'GET_CONTENT':
          sendContent();
          break;
      }
    };

    const handleInit = (payload: { json?: any; html?: string; mjml?: string; template?: string; themeBlocks?: Record<string, ThemeBlock>; mergeTags?: Record<string, any> }) => {
      console.log('PostMessageBridge: handleInit called with:', {
        hasJson: !!payload.json,
        hasMjml: !!payload.mjml,
        hasHtml: !!payload.html,
        template: payload.template,
        themeBlocksCount: payload.themeBlocks ? Object.keys(payload.themeBlocks).length : 0
      });

      // Handle theme blocks from Mautic
      if (payload.themeBlocks && Object.keys(payload.themeBlocks).length > 0) {
        globalThemeBlocks = payload.themeBlocks;
        if (themeBlocksUpdateCallback) {
          themeBlocksUpdateCallback(payload.themeBlocks);
        }
        console.log('PostMessageBridge: Theme blocks received:', Object.keys(payload.themeBlocks));
      }

      // Handle mergeTags from Mautic
      if (payload.mergeTags && Object.keys(payload.mergeTags).length > 0 && onMergeTagsReceived) {
        onMergeTagsReceived(payload.mergeTags);
        console.log('PostMessageBridge: MergeTags received:', Object.keys(payload.mergeTags).length, 'tokens');
      }

      // For new templates without MJML, use default. Otherwise import the content.
      if (payload.template === 'new' && !payload.mjml && !payload.json) {
        console.log('PostMessageBridge: New template without content, using default');
        return;
      }

      try {
        if (payload.json) {
          const jsonData = typeof payload.json === 'string' ? JSON.parse(payload.json) : payload.json;
          console.log('PostMessageBridge: Parsed JSON, has content:', !!jsonData.content);

          if (jsonData.content) {
            restart({
              subject: jsonData.subject || 'Email',
              content: jsonData.content,
              subTitle: jsonData.subTitle || '',
            });
          } else {
            restart({
              subject: 'Email',
              content: jsonData,
              subTitle: '',
            });
          }
          console.log('PostMessageBridge: JSON content imported successfully');
        } else if (payload.mjml) {
          console.log('PostMessageBridge: Converting MJML, length:', payload.mjml.length);
          const content = MjmlToJson(payload.mjml);
          restart({
            subject: 'Imported Email',
            content,
            subTitle: '',
          });
          console.log('PostMessageBridge: MJML content imported successfully');
        } else if (payload.html) {
          console.log('PostMessageBridge: HTML only received - cannot import rendered HTML');
        } else {
          console.log('PostMessageBridge: No content to import');
        }
      } catch (error: any) {
        console.error('PostMessageBridge: Failed to import:', error);
        if (parentOrigin) {
          window.parent.postMessage({ type: 'ERROR', message: error.message }, parentOrigin);
        }
      }
    };

    const sendContent = () => {
      if (!parentOrigin) return;

      const mjmlString = JsonToMjml({
        data: values.content,
        mode: 'production',
        context: values.content,
        dataSource: mergeTags,
      });
      const html = mjml(mjmlString, {}).html;

      window.parent.postMessage({
        type: 'CONTENT',
        html,
        mjml: mjmlString,
        json: values,
      }, parentOrigin);
    };

    window.addEventListener('message', handleMessage);

    // Send READY to parent after mount
    if (parentOrigin && window.parent !== window && !initialized) {
      setInitialized(true);
      setTimeout(() => {
        window.parent.postMessage({ type: 'READY' }, parentOrigin);
        console.log('PostMessageBridge: Sent READY to', parentOrigin);
      }, 100);
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [values, restart, mergeTags, initialized]);

  return null;
}

// Helper function to send save message to parent (Mautic)
function sendSaveToParent(values: IEmailTemplate, mergeTags: Record<string, any>) {
  // Same-origin - always use window.location.origin
  const origin = window.location.origin;

  if (window.parent === window) {
    return; // Not in iframe
  }

  try {
    const mjmlString = JsonToMjml({
      data: values.content,
      mode: 'production',
      context: values.content,
      dataSource: mergeTags,
    });
    const html = mjml(mjmlString, {}).html;

    window.parent.postMessage({
      type: 'SAVE',
      html,
      mjml: mjmlString,
      json: values,
    }, origin);
    console.log('PostMessageBridge: Sent SAVE to parent');
  } catch (error) {
    console.error('PostMessageBridge: Failed to send save:', error);
  }
}

const defaultCategories: ExtensionProps['categories'] = [
  {
    label: 'Content',
    active: true,
    blocks: [
      {
        type: AdvancedType.TEXT,
      },
      {
        type: AdvancedType.IMAGE,
        payload: { attributes: { padding: '0px 0px 0px 0px' } },
      },
      {
        type: AdvancedType.BUTTON,
      },
      {
        type: AdvancedType.SOCIAL,
      },
      {
        type: AdvancedType.DIVIDER,
      },
      {
        type: AdvancedType.SPACER,
      },
      {
        type: AdvancedType.HERO,
      },
      {
        type: AdvancedType.WRAPPER,
      },
    ],
  },
  {
    label: 'Layout',
    active: true,
    displayType: 'column',
    blocks: [
      {
        title: '2 columns',
        payload: [
          ['50%', '50%'],
          ['33%', '67%'],
          ['67%', '33%'],
          ['25%', '75%'],
          ['75%', '25%'],
        ],
      },
      {
        title: '3 columns',
        payload: [
          ['33.33%', '33.33%', '33.33%'],
          ['25%', '25%', '50%'],
          ['50%', '25%', '25%'],
        ],
      },
      {
        title: '4 columns',
        payload: [['25%', '25%', '25%', '25%']],
      },
    ],
  },
];

// Helper function to convert MJML to block data
function mjmlToBlockData(mjmlContent: string): IBlockData | null {
  try {
    // Check if content already starts with mj-section (complex block)
    const isSection = mjmlContent.trim().startsWith('<mj-section');
    
    let fullMjml: string;
    if (isSection) {
      // For sections, wrap only in mjml/mj-body
      fullMjml = '<mjml><mj-body>' + mjmlContent + '</mj-body></mjml>';
    } else {
      // For simple elements, wrap in full structure
      fullMjml = '<mjml><mj-body><mj-section><mj-column>' + mjmlContent + '</mj-column></mj-section></mj-body></mjml>';
    }
    
    console.log('mjmlToBlockData: Parsing MJML, isSection:', isSection);
    const pageData = MjmlToJson(fullMjml);
    console.log('mjmlToBlockData: Full parsed structure:', JSON.stringify(pageData, null, 2).substring(0, 500));
    
    // MjmlToJson structure: page -> section -> column -> element
    // (no separate "body" wrapper - mj-body content goes directly under page)
    
    if (!pageData.children || pageData.children.length === 0) {
      console.error('mjmlToBlockData: No children in page');
      return null;
    }
    
    // First child is the section
    const section = pageData.children[0];
    console.log('mjmlToBlockData: section type:', section?.type);
    
    if (isSection) {
      // For mj-section blocks, return the section itself
      console.log('mjmlToBlockData: Returning section block');
      return section;
    }
    
    // For simple elements, navigate to column -> element
    if (!section.children || section.children.length === 0) {
      console.error('mjmlToBlockData: No children in section');
      return section;
    }
    
    const column = section.children[0];
    console.log('mjmlToBlockData: column type:', column?.type);
    
    if (!column.children || column.children.length === 0) {
      console.error('mjmlToBlockData: No children in column');
      return column;
    }
    
    const element = column.children[0];
    console.log('mjmlToBlockData: element type:', element?.type);
    
    return element;
  } catch (error) {
    console.error('Failed to parse MJML block:', error);
    return null;
  }
}

const imageCompression = import('browser-image-compression');

const fontList = [
  'Arial',
  'Tahoma',
  'Verdana',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Lato',
  'Montserrat'
].map(item => ({ value: item, label: item }));

export default function Editor() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [theme, setTheme] = useState<'blue' | 'green' | 'purple'>('purple');
  const dispatch = useDispatch();
  const history = useHistory();
  var templateData = useAppSelector('template');
  const [locale, setLocale] = useState(new URLSearchParams(window.location.search).get('locale') || 'de');
  const [themeBlocks, setThemeBlocks] = useState<Record<string, ThemeBlock>>(globalThemeBlocks);
  
  // Register callback for theme blocks updates from PostMessageBridge
  useEffect(() => {
    themeBlocksUpdateCallback = setThemeBlocks;
    // If blocks were already received before component mounted
    if (Object.keys(globalThemeBlocks).length > 0) {
      setThemeBlocks(globalThemeBlocks);
    }
    return () => {
      themeBlocksUpdateCallback = null;
    };
  }, []);

  // Build dynamic categories including theme blocks
  const dynamicCategories = useMemo(() => {
    const categories = [...defaultCategories];
    
    if (Object.keys(themeBlocks).length > 0) {
      console.log('Editor: Building theme category with', Object.keys(themeBlocks).length, 'blocks');
      
      const themeBlocksList = Object.entries(themeBlocks)
        .map(([key, block]) => {
          console.log('Editor: Processing block:', key, 'label:', block.label);
          const blockData = mjmlToBlockData(block.content);
          if (!blockData) {
            console.error('Editor: Failed to parse block:', key);
            return null;
          }
          
          console.log('Editor: Block', key, 'parsed as type:', blockData.type);
          
          return {
            type: blockData.type,
            title: block.label,  // Use label from blocks.json
            payload: blockData,
          };
        })
        .filter(Boolean);
      
      if (themeBlocksList.length > 0) {
        categories.splice(1, 0, {
          label: 'Theme',
          active: true,
          blocks: themeBlocksList as any[],
        });
        console.log('Editor: Theme category added with', themeBlocksList.length, 'blocks');
      }
    }
    
    return categories;
  }, [themeBlocks]);
  const isEmbedded = useMemo(() => {
    // Always embedded mode - editor is part of Mautic plugin
    return true;
    // Same-origin - parent is always at window.location.origin
    // return urlParams.has("origin");
  }, []);
  const { addCollection, removeCollection, collectionCategory } = useCollection();
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  const { width } = useWindowSize();

  const emailPattern =
    // eslint-disable-next-line
    /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i;

  const postEmail = async () => {
    if (!emailPattern.test(text)) {
      Message.error('Please enter a valid email address');
      return;
    }
    pushEvent({
      event: 'TryNewEditor',
      payload: { email: text },
    });
    await axios.post(`/api/email`, {
      email: text,
    });
    setVisible(false);
  };

  const smallScene = width < 1400;

  const { openModal, modal } = useEmailModal();
  const { id, userId } = useQuery();
  const loading = useLoading(template.loadings.fetchById);
  const {
    modal: mergeTagsModal,
    openModal: openMergeTagsModal,
    mergeTags,
    setMergeTags,
  } = useMergeTagsModal(testMergeTags);

  const isSubmitting = useLoading([
    template.loadings.create,
    template.loadings.updateById,
  ]);

  useEffect(() => {
    if (collectionCategory) {
      BlockMarketManager.addCategories([collectionCategory]);
      return () => {
        BlockMarketManager.removeCategories([collectionCategory]);
      };
    }
  }, [collectionCategory]);

  

  useEffect(() => {
    if (id) {
      if (!userId) {
        UserStorage.getAccount().then(account => {
          dispatch(template.actions.fetchById({ id: +id, userId: account.user_id }));
        });
      } else {
        dispatch(template.actions.fetchById({ id: +id, userId: +userId }));
      }
    } else {
      dispatch(template.actions.fetchDefaultTemplate(undefined));
    }

    return () => {
      dispatch(template.actions.set(null));
    };
  }, [dispatch, id, userId]);

  useEffect(() => {
    if (isDarkMode) {
      document.body.setAttribute('arco-theme', 'dark');
    } else {
      document.body.removeAttribute('arco-theme');
    }
  }, [isDarkMode]);
  // Intercept upload button clicks in embedded mode to open asset manager directly
  useEffect(() => {
    if (!isEmbedded) return;
    
    // Same-origin - parent is always at window.location.origin
    const parentOrigin = window.location.origin;
    if (!parentOrigin) return;
    
    let activeInputField: HTMLInputElement | null = null;
    
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if click is on upload div (class starts with _upload_)
      const uploadDiv = target.closest('[class*="_upload_"]') as HTMLElement;
      if (uploadDiv && uploadDiv.className.match(/_upload_[a-z0-9]+/i)) {
        // Find the associated input field in the container
        const container = uploadDiv.closest('[class*="_container_"]') || uploadDiv.parentElement;
        const inputField = container?.querySelector('input') as HTMLInputElement;
        
        if (inputField) {
          activeInputField = inputField;
        }
        
        // Prevent the default file dialog
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Open asset manager
        window.parent.postMessage({ type: 'OPEN_ASSET_MANAGER' }, parentOrigin);
        return;
      }
      
      // Also check if click is on upload button (fallback for other upload elements)
      const uploadButton = target.closest('button');
      if (!uploadButton) return;
      
      // Look for IconUpload SVG or upload-related button
      const hasUploadIcon = uploadButton.querySelector('svg[class*="icon-upload"]') ||
                           uploadButton.querySelector('[class*="IconUpload"]') ||
                           uploadButton.innerHTML.includes('M4 16v1a3') || // IconUpload path
                           (uploadButton.getAttribute('class') || '').includes('upload');
      
      // Also check for arco icon upload class
      const arcoIcon = uploadButton.querySelector('.arco-icon-upload');
      
      if (!hasUploadIcon && !arcoIcon) return;
      
      // Find the associated input field
      const container = uploadButton.closest('.easy-email-extensions') || 
                       uploadButton.closest('[class*="ImageUploader"]') ||
                       uploadButton.parentElement?.parentElement;
      const inputField = container?.querySelector('input[type="text"]') as HTMLInputElement;
      
      if (inputField) {
        activeInputField = inputField;
      }
      
      // Prevent the default file dialog
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Open asset manager
      window.parent.postMessage({ type: 'OPEN_ASSET_MANAGER' }, parentOrigin);
    };
    
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== parentOrigin) return;
      
      if (event.data?.type === 'ASSET_SELECTED' && event.data.url) {
        if (activeInputField) {
          // Update the input field value
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          )?.set;
          nativeInputValueSetter?.call(activeInputField, event.data.url);
          
          // Trigger input event for React to pick up the change
          const inputEvent = new Event('input', { bubbles: true });
          activeInputField.dispatchEvent(inputEvent);
          
          // Also trigger change event
          const changeEvent = new Event('change', { bubbles: true });
          activeInputField.dispatchEvent(changeEvent);
          
          activeInputField = null;
        }
      }
    };
    
    // Use capture phase to intercept before the Uploader
    document.addEventListener('click', handleClick, true);
    window.addEventListener('message', handleMessage);
    
    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('message', handleMessage);
    };
  }, [isEmbedded]);

  const onUploadImage = useCallback(async (blob: Blob): Promise<string> => {
    // Check if we are in Mautic iframe mode
    // Same-origin - parent is always at window.location.origin
    const parentOrigin = window.location.origin;
    
    if (parentOrigin && window.parent !== window) {
      // Embedded mode: Use Mautic Asset Manager via PostMessage
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          window.removeEventListener('message', handler);
          // Fallback: If no response, try direct upload
          handleDirectUpload(blob).then(resolve).catch(reject);
        }, 60000); // 60 second timeout
        
        const handler = (event: MessageEvent) => {
          if (event.origin !== parentOrigin) return;
          
          if (event.data?.type === 'ASSET_SELECTED') {
            clearTimeout(timeoutId);
            window.removeEventListener('message', handler);
            resolve(event.data.url);
          } else if (event.data?.type === 'ASSET_CANCELLED') {
            clearTimeout(timeoutId);
            window.removeEventListener('message', handler);
            reject(new Error('Asset selection cancelled'));
          }
        };
        
        window.addEventListener('message', handler);
        
        // Request Mautic to open asset manager
        window.parent.postMessage({ type: 'OPEN_ASSET_MANAGER' }, parentOrigin);
      });
    }
    
    // Standalone mode: Use direct upload
    return handleDirectUpload(blob);
  }, []);
  
  const handleDirectUpload = async (blob: Blob): Promise<string> => {
    const compressionFile = await (
      await imageCompression
    ).default(blob as File, {
      maxWidthOrHeight: 1440,
    });
    return services.common.uploadByQiniu(compressionFile);
  };
  const onChangeTheme = useCallback(t => {
    setTheme(t);
  }, []);

  const onChangeMergeTag = useCallback((path: string, val: any) => {
    setMergeTags(old => {
      const newObj = cloneDeep(old);
      set(newObj, path, val);
      return newObj;
    });
  }, []);

  const onImportMJML = async ({
    restart,
  }: {
    restart: (val: IEmailTemplate) => void;
  }) => {
    const uploader = new Uploader(() => Promise.resolve(''), {
      accept: 'text/mjml',
      limit: 1,
    });

    const [file] = await uploader.chooseFile();
    const reader = new FileReader();
    const pageData = await new Promise<[string, IEmailTemplate['content']]>(
      (resolve, reject) => {
        reader.onload = function (evt) {
          if (!evt.target) {
            reject();
            return;
          }
          try {
            const pageData = MjmlToJson(evt.target.result as any);
            resolve([file.name, pageData]);
          } catch (error) {
            reject();
          }
        };
        reader.readAsText(file);
      },
    );

    restart({
      subject: pageData[0],
      content: pageData[1],
      subTitle: '',
    });
  };

  const onImportJSON = async ({
    restart,
  }: {
    restart: (val: IEmailTemplate) => void;
  }) => {
    const uploader = new Uploader(() => Promise.resolve(''), {
      accept: 'application/json',
      limit: 1,
    });

    const [file] = await uploader.chooseFile();
    const reader = new FileReader();
    const emailTemplate = await new Promise<IEmailTemplate>((resolve, reject) => {
      reader.onload = function (evt) {
        if (!evt.target) {
          reject();
          return;
        }
        try {
          const template = JSON.parse(evt.target.result as any) as IEmailTemplate;
          resolve(template);
        } catch (error) {
          reject();
        }
      };
      reader.readAsText(file);
    });

    restart({
      subject: emailTemplate.subject,
      content: emailTemplate.content,
      subTitle: emailTemplate.subTitle,
    });
  };

  const onExportMJML = (values: IEmailTemplate) => {
    const mjmlString = JsonToMjml({
      data: values.content,
      mode: 'production',
      context: values.content,
      dataSource: mergeTags,
    });

    pushEvent({ event: 'MJMLExport', payload: { values, mergeTags } });
    saveAs(new Blob([mjmlString], { type: 'text/mjml' }), 'easy-email.mjml');
  };

  const onExportHTML = (values: IEmailTemplate) => {
    const mjmlString = JsonToMjml({
      data: values.content,
      mode: 'production',
      context: values.content,
      dataSource: mergeTags,
    });

    const html = mjml(mjmlString, {}).html;

    pushEvent({ event: 'HTMLExport', payload: { values, mergeTags } });
    saveAs(new Blob([html], { type: 'text/html' }), 'easy-email.html');
  };

  const onExportJSON = (values: IEmailTemplate) => {
    saveAs(
      new Blob([JSON.stringify(values, null, 2)], { type: 'application/json' }),
      'easy-email.json',
    );
  };

  const onExportImage = async (values: IEmailTemplate) => {
    Message.loading('Loading...');
    const html2canvas = (await import('html2canvas')).default;
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    const mjmlString = JsonToMjml({
      data: values.content,
      mode: 'production',
      context: values.content,
      dataSource: mergeTags,
    });

    const html = mjml(mjmlString, {}).html;

    container.innerHTML = html;
    document.body.appendChild(container);

    const blob = await new Promise<any>(resolve => {
      html2canvas(container, { useCORS: true }).then(canvas => {
        return canvas.toBlob(resolve, 'png', 0.1);
      });
    });
    saveAs(blob, 'demo.png');
    Message.clear();
  };

  const initialValues: IEmailTemplate | null = useMemo(() => {
    if (!templateData) return null;
    const sourceData = cloneDeep(templateData.content) as IBlockData;

    return {
      ...templateData,
      content: sourceData, // replace standard block
    };
  }, [templateData]);

  const onSubmit = useCallback(
    async (
      values: IEmailTemplate,
      form: FormApi<IEmailTemplate, Partial<IEmailTemplate>>,
    ) => {
      pushEvent({ event: 'EmailSave' });

      // Send to parent via postMessage (for Mautic integration)
      sendSaveToParent(values, mergeTags);

      if (id) {
        const isChanged = !(
          isEqual(initialValues?.content, values.content) &&
          isEqual(initialValues?.subTitle, values?.subTitle) &&
          isEqual(initialValues?.subject, values?.subject)
        );

        if (!isChanged) {
          Message.success('Updated success!');
          form.restart(values);
          return;
        }
        dispatch(
          template.actions.updateById({
            id: +id,
            template: values,
            success() {
              Message.success('Updated success!');
              form.restart(values);
            },
          }),
        );
      } else {
        dispatch(
          template.actions.create({
            template: values,
            success(id, newTemplate) {
              Message.success('Saved success!');
              form.restart(newTemplate);
              history.replace(`/editor?id=${id}`);
            },
          }),
        );
      }
    },
    [dispatch, history, id, initialValues, mergeTags],
  );

  const onBeforePreview: EmailEditorProviderProps['onBeforePreview'] = useCallback(
    (html: string, mergeTags) => {
      const engine = new Liquid();
      const tpl = engine.parse(html);
      return engine.renderSync(tpl, mergeTags);
    },
    [],
  );

  const themeStyleText = useMemo(() => {
    if (theme === 'green') return greenTheme;
    if (theme === 'purple') return purpleTheme;
    return blueTheme;
  }, [theme]);

  if (!templateData && loading) {
    return (
      <Loading loading={loading}>
        <div style={{ height: '100vh' }} />
      </Loading>
    );
  }

  if (!initialValues) return null;


  return (
    <ConfigProvider locale={enUS}>
      <div>
        <style>{themeStyleText}</style>
        <EmailEditorProvider
          key={id}
          height={'calc(100vh - 68px)'}
          data={initialValues}
          // interactiveStyle={{
          //   hoverColor: '#78A349',
          //   selectedColor: '#1890ff',
          // }}
          // onAddCollection={addCollection}
          // onRemoveCollection={({ id }) => removeCollection(id)}
          onUploadImage={onUploadImage}
          fontList={fontList}
          onSubmit={onSubmit}
          onChangeMergeTag={onChangeMergeTag}
          autoComplete
          enabledLogic
          // enabledMergeTagsBadge
          dashed={false}
          mergeTags={mergeTags}
          mergeTagGenerate={tag => `{${tag}}`}
          onBeforePreview={onBeforePreview}
          socialIcons={[]}
          locale={localesData[locale]}
        >
          {({ values }, { submit, restart }) => {
            return (
              <>
                <PostMessageBridge values={values} restart={restart} mergeTags={mergeTags} onMergeTagsReceived={setMergeTags} />
                {isEmbedded && (
                  <Button
                    type="primary"
                    status="success"
                    style={{
                      position: "absolute",
                      top: "10px",
                      left: "20px",
                      zIndex: 10001,
                    }}
                    onClick={() => {
                      sendSaveToParent(values, mergeTags);
                      // Same-origin - parent is always at window.location.origin
                      const origin = window.location.origin;
                      if (window.parent !== window) {
                        window.parent.postMessage({ type: "CLOSE" }, origin);
                      }
                    }}
                  >
                    Exit
                  </Button>
                )}
                <PageHeader
                  style={{ background: 'var(--color-bg-2)' }}
                  extra={
                    <Stack alignment='center'>
                      <Button
                        onClick={() => setIsDarkMode(v => !v)}
                        shape='circle'
                        type='text'
                        icon={isDarkMode ? <IconMoonFill /> : <IconSunFill />}
                      ></Button>

                      {!isEmbedded && (
                        <>
                          <Select
                            onChange={onChangeTheme}
                            value={theme}
                          >
                            <Select.Option value='blue'>Blue</Select.Option>
                            <Select.Option value='green'>Green</Select.Option>
                            <Select.Option value='purple'>Purple</Select.Option>
                          </Select>
                          <Select
                            onChange={setLocale}
                            value={locale}
                          >
                            <Select.Option value='en'>English</Select.Option>
                            <Select.Option value='de'>Deutsch</Select.Option>
                          </Select>
                        </>
                      )}

                      {/* <Button onClick={openMergeTagsModal}>Update mergeTags</Button> */}
                      {!isEmbedded && (<>

                      <Dropdown
                        droplist={
                          <Menu>
                            <Menu.Item
                              key='MJML'
                              onClick={() => onImportMJML({ restart })}
                            >
                              Import from MJML
                            </Menu.Item>

                            <Menu.Item
                              key='JSON'
                              onClick={() => onImportJSON({ restart })}
                            >
                              Import from JSON
                            </Menu.Item>
                          </Menu>
                        }
                      >
                        <Button>
                          <strong>Import</strong>
                        </Button>
                      </Dropdown>

                      <Dropdown
                        droplist={
                          <Menu>
                            <Menu.Item
                              key='Export MJML'
                              onClick={() => onExportMJML(values)}
                            >
                              Export MJML
                            </Menu.Item>
                            <Menu.Item
                              key='Export HTML'
                              onClick={() => onExportHTML(values)}
                            >
                              Export HTML
                            </Menu.Item>
                          </Menu>
                        }
                      >
                        <Button>
                          <strong>Export</strong>
                        </Button>
                      </Dropdown>
                      </>)}
                    </Stack>
                  }
                />
                <StandardLayout
                  compact={!smallScene}
                  categories={dynamicCategories}
                >
                  <EmailEditor />
                </StandardLayout>
                {!isEmbedded && <AutoSaveAndRestoreEmail />}
              </>
            );
          }}
        </EmailEditorProvider>
        {modal}
        {mergeTagsModal}
        <Modal
          title={<p style={{ textAlign: 'left' }}>Leave your email</p>}
          visible={visible}
          onCancel={() => setVisible(false)}
          onOk={postEmail}
        >
          <Form.Item label='Email'>
            <Input
              value={text}
              onChange={setText}
            />
          </Form.Item>
        </Modal>
        <style>{`#bmc-wbtn {display:none !important;}`}</style>
      </div>
    </ConfigProvider>
  );
}

function replaceStandardBlockToAdvancedBlock(blockData: IBlockData) {
  const map = {
    [BasicType.TEXT]: AdvancedType.TEXT,
    [BasicType.BUTTON]: AdvancedType.BUTTON,
    [BasicType.IMAGE]: AdvancedType.IMAGE,
    [BasicType.DIVIDER]: AdvancedType.DIVIDER,
    [BasicType.SPACER]: AdvancedType.SPACER,
    [BasicType.SOCIAL]: AdvancedType.SOCIAL,
    [BasicType.ACCORDION]: AdvancedType.ACCORDION,
    [BasicType.CAROUSEL]: AdvancedType.CAROUSEL,
    [BasicType.NAVBAR]: AdvancedType.NAVBAR,
    [BasicType.WRAPPER]: AdvancedType.WRAPPER,
    [BasicType.SECTION]: AdvancedType.SECTION,
    [BasicType.GROUP]: AdvancedType.GROUP,
    [BasicType.COLUMN]: AdvancedType.COLUMN,
  };

  if (map[blockData.type]) {
    blockData.type = map[blockData.type];
  }
  blockData.children.forEach(replaceStandardBlockToAdvancedBlock);
  return blockData;
}
