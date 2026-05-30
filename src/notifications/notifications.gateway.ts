import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  afterInit() {
    this.logger.log('NotificationsGateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Broadcast a notification to all connected clients.
   */
  broadcastNotification(notification: {
    type: 'pickup' | 'return' | 'pending_return';
    title: string;
    message: string;
    bookingId: string;
    orderId: string;
    customerName: string;
    productName: string;
  }) {
    this.server.emit('notification', {
      id: `${notification.type}_${notification.bookingId}_${Date.now()}`,
      ...notification,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Broadcast a batch refresh signal telling all clients to refetch.
   */
  broadcastRefresh() {
    this.server.emit('notifications:refresh');
  }
}
