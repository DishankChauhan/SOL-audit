/**
 * WebSocket connection handler for Solana transactions
 */

// Enable WebSockets for transaction confirmations
export function enableWebSocketsForTransactions(): void {
  if (typeof window !== 'undefined') {
    console.log('WebSocket connections enabled for transaction confirmations');
  }
}

// Close any stale WebSocket connections
export function closeStaleWebSockets(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  let closedCount = 0;
  // Find WebSocket instances that haven't had activity in over 60 seconds
  const now = Date.now();
  
  // Use a less aggressive approach that only targets stale connections
  Object.keys(window).forEach(key => {
    const prop = (window as any)[key];
    if (prop && 
        typeof prop === 'object' && 
        prop.readyState === 1 && // OPEN state only
        typeof prop.close === 'function' &&
        prop._lastActivity && 
        now - prop._lastActivity > 60000) { // 60 seconds of inactivity
      try {
        console.log('Closing stale WebSocket connection:', key);
        prop.close();
        closedCount++;
      } catch (e) {
        console.error('Error closing WebSocket-like object:', e);
      }
    }
  });
  
  return closedCount;
}

export default { enableWebSocketsForTransactions, closeStaleWebSockets }; 