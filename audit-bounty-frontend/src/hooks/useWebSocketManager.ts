import { useEffect, useRef } from 'react';

/**
 * React hook to prevent WebSocket connections for Solana transactions
 * Use this in your app's layout or top-level component
 */
export function useWebSocketManager() {
  // Store the original WebSocket in a ref so we can restore it on cleanup
  const originalWebSocketRef = useRef<any>(null);
  
  useEffect(() => {
    // Monkey patch WebSocket constructor to prevent Solana-related connections
    if (typeof window !== 'undefined') {
      // Store the original WebSocket constructor
      originalWebSocketRef.current = window.WebSocket;
      
      // @ts-ignore - we're intentionally modifying WebSocket
      window.WebSocket = function(url: string, protocols?: string | string[]) {
        // Intercept any Solana-related WebSocket connections
        if (url.includes('solana') || url.includes('alchemy') || url.includes('wss://')) {
          console.warn('Blocking Solana WebSocket connection to:', url);
          
          // Return a fake WebSocket that does nothing
          return {
            url,
            readyState: 3, // CLOSED state
            CONNECTING: 0,
            OPEN: 1,
            CLOSING: 2,
            CLOSED: 3,
            onopen: null,
            onclose: null,
            onerror: null,
            onmessage: null,
            send: () => {},
            close: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true
          };
        }
        
        // Allow other WebSocket connections
        return new originalWebSocketRef.current(url, protocols);
      };
      
      // Preserve static properties
      for (const prop in originalWebSocketRef.current) {
        if (Object.prototype.hasOwnProperty.call(originalWebSocketRef.current, prop)) {
          // @ts-ignore
          window.WebSocket[prop] = originalWebSocketRef.current[prop];
        }
      }
      
      // Preserve prototype
      window.WebSocket.prototype = originalWebSocketRef.current.prototype;
      
      console.log('WebSocket patching applied - Solana WebSocket connections will be blocked');
    }
    
    // Cleanup function to restore original WebSocket
    return () => {
      if (typeof window !== 'undefined' && originalWebSocketRef.current) {
        // @ts-ignore - restore original WebSocket
        window.WebSocket = originalWebSocketRef.current;
        console.log('Original WebSocket constructor restored');
      }
    };
  }, []);
}

export default useWebSocketManager; 