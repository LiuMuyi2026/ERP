import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class WeComApi implements ICredentialType {
  name = 'weComApi';
  displayName = 'WeCom API';
  documentationUrl = 'https://developer.work.weixin.qq.com/';
  properties: INodeProperties[] = [
    {
      displayName: 'Corp ID',
      name: 'corpId',
      type: 'string',
      default: '',
      required: true,
      description: 'WeCom Corporation ID (企业ID)',
    },
    {
      displayName: 'Corp Secret',
      name: 'corpSecret',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'WeCom Application Secret',
    },
    {
      displayName: 'Agent ID',
      name: 'agentId',
      type: 'string',
      default: '',
      description: 'WeCom Application Agent ID',
    },
    {
      displayName: 'Token',
      name: 'token',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'WeCom Callback Token (for webhook verification)',
    },
    {
      displayName: 'Encoding AES Key',
      name: 'encodingAesKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'WeCom Callback EncodingAESKey',
    },
  ];
}
