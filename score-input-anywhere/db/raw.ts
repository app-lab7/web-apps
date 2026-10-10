import {env} from 'cloudflare:workers';
export function database():D1Database {if(!env.DB)throw new Error('保存先に接続できません。時間をおいて再度お試しください。');return env.DB;}
