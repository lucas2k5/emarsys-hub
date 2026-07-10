/**
 * Upload do CSV de catálogo via SFTP.
 * Config vem da connection `sftp_products` do environment.
 */

import SftpClient from 'ssh2-sftp-client';

export type SftpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
};

export async function uploadBufferToSftp(cfg: SftpConfig, content: Buffer, fileName: string): Promise<string> {
  if (!cfg.host) throw new Error('SFTP: host não configurado');
  if (!cfg.username) throw new Error('SFTP: username não configurado');
  if (!cfg.password) throw new Error('SFTP: password não configurada');

  const remoteDir = cfg.remotePath || '/';
  const remoteFile = remoteDir.endsWith('/') ? remoteDir + fileName : `${remoteDir}/${fileName}`;

  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      password: cfg.password,
      readyTimeout: 30_000,
      keepaliveInterval: 5_000,
      keepaliveCountMax: 10,
    });
    await sftp.put(content, remoteFile);
    console.log(`✅ [sftp] Upload concluído: ${remoteFile}`);
    return remoteFile;
  } finally {
    // end() de um cliente que nem conectou pode lançar e mascarar o erro original
    try {
      await sftp.end();
    } catch {
      /* ignora */
    }
  }
}
