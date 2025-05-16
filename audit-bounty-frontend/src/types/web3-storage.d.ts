declare module 'web3.storage' {
  export interface Web3StorageOptions {
    token: string;
    endpoint?: string;
  }

  export interface PutOptions {
    name?: string;
    maxRetries?: number;
  }

  export class Web3Storage {
    constructor(options: Web3StorageOptions);
    
    /**
     * Upload files to Web3.Storage
     */
    put(files: File[], options?: PutOptions): Promise<string>;
    
    /**
     * Retrieve files by CID
     */
    get(cid: string): Promise<any>;
    
    /**
     * Check the status of a CID
     */
    status(cid: string): Promise<any>;
    
    /**
     * List all uploads
     */
    list(options?: any): Promise<any>;
  }
} 