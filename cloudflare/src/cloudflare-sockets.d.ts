declare module "cloudflare:sockets" {
  export interface SocketOptions {
    secureTransport?: "on" | "off" | "starttls";
    allowHalfOpen?: boolean;
  }
  export interface SocketAddress {
    hostname: string;
    port: number;
  }
  export interface Socket {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    readonly opened: Promise<unknown>;
    readonly closed: Promise<void>;
    close(): Promise<void>;
  }
  export function connect(address: SocketAddress | string, options?: SocketOptions): Socket;
}
