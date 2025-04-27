import { db } from './admin';
import admin from './admin';

interface NotificationData {
  userId: string;
  type: string;
  title: string;
  message: string;
  read?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Create a notification in Firestore for a user
 * @param data Notification data including userId, type, title, message
 * @returns Promise with the created notification ID
 */
export async function createNotification(data: NotificationData): Promise<string> {
  try {
    const { userId, type, title, message, metadata = {} } = data;
    
    // Create notification document
    const notificationRef = await db.collection('notifications').add({
      userId,
      type,
      title,
      message,
      metadata,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`Created notification for user ${userId}: ${title}`);
    return notificationRef.id;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
} 