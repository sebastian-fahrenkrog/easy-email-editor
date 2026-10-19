import { request } from './axios.config';
import axios from 'axios';

const UPLOAD_URL = 'https://m.dev.testserver.online/image/upload';

export const common = {
  async uploadByQiniu(file: File | Blob): Promise<string> {
    const data = new FormData();
    data.append('file', file);
    data.append('upload_preset', 'easy-email-test');

    const res = await axios.post<{ url: string; }>(UPLOAD_URL, data);
    return res.data.url;
  },
  uploadByUrl(url: string) {
    return request.get<string>('/upload/user/upload-by-url', {
      params: {
        url,
      },
    });
  },
  getMenu(): Promise<IAppMenuItem[]> {
    return Promise.resolve([
      {
        name: '数据模板',
        icon: 'bar-chart',
        isOpen: true,
        children: [
          {
            name: '数据模板',
            url: '/',
          },
        ],
      },
    ]);
  },
  sendTestEmail(data: { toEmail: string; subject: string; html: string; text: string; }) {
    return request.post('/email/user/send', {
      to_email: data.toEmail,
      subject: data.subject,
      text: data.text,
      html: data.html,
    });
  },
};

export interface IAppMenuItem {
  name: string;
  url?: string;
  icon: string;
  isOpen?: boolean;
  children: IAppSubMenuItem[];
}

export interface IAppSubMenuItem {
  name: string;
  url: string;
  isOpen?: boolean;
}
