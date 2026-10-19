import { BlockManager,IPage, BasicType, IBlockData } from 'easy-email-core';
import { identity, isString, pickBy } from 'lodash';
import { parseXMLtoBlock } from './parseXMLtoBlock';

export function MjmlToJson(data: MjmlBlockItem | string): IPage {
  if (isString(data)) return parseXMLtoBlock(data);

  const transform = (item: IChildrenItem): IBlockData => {
    const attributes = item.attributes as any;

    switch (item.tagName) {
      case 'mjml':
        const body = item.children?.find((item) => item.tagName === 'mj-body')!;
        const head = item.children?.find((item) => item.tagName === 'mj-head');
        const metaData = getMetaDataFromMjml(head);

        const fonts =
          head?.children
            ?.filter((child) => child.tagName === 'mj-font')
            .map((child) => ({
              name: child.attributes.name,
              href: child.attributes.href,
            })) || [];

        const mjAttributes =
          head?.children?.find((item) => item.tagName === 'mj-attributes')
            ?.children || [];

        const headStyles = head?.children
          ?.filter((item) => item.tagName === 'mj-style')
          .map((item) => ({ content: item.content, inline: item.inline }));

        // Page-level values the editor manages itself. Without Easy Email metadata (a template
        // that never went through this editor) they are taken from the template's own
        // mj-attributes, so the editor defaults do not override the theme.
        const pageMeta = { ...pageMetaFromAttributes(mjAttributes), ...metaData };
        // Keys the template leaves open stay empty instead of falling back to the editor
        // defaults (14px, -apple-system, ...). Empty values survive the metadata round trip.
        if (Object.keys(metaData).length === 0) {
          LIFTED_PAGE_KEYS.forEach((key) => {
            if (pageMeta[key] === undefined) pageMeta[key] = '';
          });
        }

        const headAttributes = [
          ...new Set(
            mjAttributes
              .map((item) => withoutPageMeta(item, pageMeta))
              .filter((item): item is IChildrenItem => Boolean(item))
              .map(
                (item) =>
                  `<${item.tagName} ${Object.keys(item.attributes)
                    .map((key) => `${key}="${item.attributes[key]}"`)
                    .join(' ')}></${item.tagName}>`
              )
          ),
        ].join('\n');

        const title = head?.children?.find((item) => item.tagName === 'mj-title');
        const preview = head?.children?.find((item) => item.tagName === 'mj-preview');

        const breakpoint = head?.children?.find(
          (item) => item.tagName === 'mj-breakpoint'
        );

        return BlockManager.getBlockByType<IPage>(BasicType.PAGE)!.create({
          attributes: body.attributes,
          children: body.children?.map(transform),
          data: {
            value: {
              headAttributes: headAttributes,
              headStyles: headStyles,
              fonts,
              breakpoint: breakpoint?.attributes.width,
              ...(title ? { title: title.content || '' } : {}),
              ...(preview ? { preview: preview.content || '' } : {}),
              ...pageMeta,
            },
          },
        });

      default:
        const tag = item.tagName.replace('mj-', '').toLowerCase();

        const block = BlockManager.getBlockByType(tag as any);
        if (!block) {
          throw new Error(`${tag} block no found `);
        }
        const payload: IBlockData<any> = {
          type: block.type,
          attributes: attributes,
          data: {
            value: {},
          },
          children: [],
        };

        if (item.content) {
          payload.data.value.content = item.content;
        }

        if (block.type === BasicType.CAROUSEL) {
          payload.data.value.images =
            item.children?.map((child) => {
              return child.attributes;
            }) || [];
          payload.children = [];
        } else if (block.type === BasicType.NAVBAR) {
          payload.data.value.links =
            item.children?.map((child) => {
              const navbarLinkData = {
                // default config
                color: '#1890ff',
                'font-size': '13px',
                target: '_blank',
                padding: '15px 10px',

                ...child.attributes,
                content: child.content,
              };
              formatPadding(navbarLinkData, 'padding');
              return navbarLinkData;
            }) || [];
          payload.children = [];
        } else if (block.type === BasicType.SOCIAL) {
          payload.data.value.elements =
            item.children?.map((child) => {
              return {
                ...child.attributes,
                content: child.content,
              };
            }) || [];
          payload.children = [];
        } else if (item.children) {
          payload.children = item.children.map(transform);
        }

        const blockData = block.create(payload);

        // format padding
        formatPadding(blockData.attributes, 'padding');
        formatPadding(blockData.attributes, 'inner-padding');
        return blockData;
    }
  };

  return transform(data);
}

export function getMetaDataFromMjml(data?: IChildrenItem): {
  [key: string]: any;
} {
  const mjmlHtmlAttributes = data?.children
    ?.filter((item) => item.tagName === 'mj-html-attributes')
    .map((item) => item.children)
    .flat()
    .filter((item) => item && item.attributes.class === 'easy-email')
    .reduce((obj: { [key: string]: any; }, item) => {
      if (!item) return obj;
      const name = item.attributes['attribute-name'];
      const isMultipleAttributes = Boolean(
        item.attributes['multiple-attributes']
      );
      obj[name] = isMultipleAttributes
        ? pickBy(
          {
            ...item.attributes,
            'attribute-name': undefined,
            'multiple-attributes': undefined,
            class: undefined,
          },
          identity
        )
        : item.attributes[name];
      return obj;
    }, {});

  // Keep empty strings: they mean "left to the template", not "use the editor default"
  return pickBy(mjmlHtmlAttributes, (value) => value !== undefined && value !== null);
}

// mj-attributes entries the Page block writes from its own values (tag -> attribute -> page key)
const PAGE_META_ATTRIBUTES: Record<string, Record<string, string>> = {
  'mj-all': { 'font-family': 'font-family' },
  'mj-text': {
    'font-size': 'font-size',
    color: 'text-color',
    'line-height': 'line-height',
    'font-weight': 'font-weight',
  },
  'mj-wrapper': { 'background-color': 'content-background-color' },
  'mj-section': { 'background-color': 'content-background-color' },
};

// Page values taken over from a template. The content background is left out on purpose:
// the Page block writes it to mj-wrapper AND mj-section, the template may only set one of them.
const LIFTED_PAGE_KEYS = ['font-family', 'font-size', 'text-color', 'line-height', 'font-weight'];

/** Page values defined by the template's mj-attributes; like MJML, a later definition wins. */
function pageMetaFromAttributes(mjAttributes: IChildrenItem[]): { [key: string]: any } {
  const meta: { [key: string]: any } = {};
  mjAttributes.forEach((item) => {
    const mapping = PAGE_META_ATTRIBUTES[item.tagName] || {};
    Object.keys(mapping).forEach((attribute) => {
      const key = mapping[attribute];
      if (LIFTED_PAGE_KEYS.includes(key) && item.attributes[attribute] !== undefined) {
        meta[key] = item.attributes[attribute];
      }
    });
  });
  return meta;
}

/**
 * Drops the attributes the Page block re-emits with the same value. Keeping them made every
 * save append another copy of the editor values to mj-attributes.
 */
function withoutPageMeta(
  item: IChildrenItem,
  pageMeta: { [key: string]: any }
): IChildrenItem | null {
  const mapping = PAGE_META_ATTRIBUTES[item.tagName] || {};
  const attributes = pickBy(
    item.attributes,
    (value, attribute) =>
      !(mapping[attribute] && pageMeta[mapping[attribute]] === value)
  );
  if (Object.keys(attributes).length === 0) return null;
  return { ...item, attributes };
}

function formatPadding(
  attributes: IBlockData['attributes'],
  attributeName: 'padding' | 'inner-padding'
) {
  const ele = document.createElement('div');
  Object.keys(attributes).forEach((key: string) => {
    if (new RegExp(`^${attributeName}`).test(key)) {
      const formatKey = new RegExp(`^${attributeName}(.*)`).exec(key)?.[0];

      if (formatKey) {
        ele.style[formatKey as any] = attributes[key];
        delete attributes[key];
      }
    }
  });
  const newPadding = [
    ele.style.paddingTop,
    ele.style.paddingRight,
    ele.style.paddingBottom,
    ele.style.paddingLeft,
  ]
    .filter(Boolean)
    .join(' ');

  if (newPadding) {
    attributes[attributeName] = newPadding;
  }
}
