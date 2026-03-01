import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class FeishuApi implements ICredentialType {
  name = 'feishuApi';
  displayName = 'Feishu / Lark API';
  documentationUrl = 'https://open.feishu.cn/document/';
  properties: INodeProperties[] = [
    {
      displayName: 'App ID',
      name: 'appId',
      type: 'string',
      default: '',
      required: true,
      description: 'Feishu/Lark App ID',
    },
    {
      displayName: 'App Secret',
      name: 'appSecret',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Feishu/Lark App Secret',
    },
    {
      displayName: 'Encrypt Key',
      name: 'encryptKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Encrypt Key for webhook payload decryption',
    },
    {
      displayName: 'Verification Token',
      name: 'verificationToken',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Verification token for webhook challenge',
    },
  ];
}
