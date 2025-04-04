/**
 * Chat client voor de Botpress chatbot
 * Bevat alle logica voor het versturen en ontvangen van berichten
 */

// Globale variabelen voor chat status
let isWaitingForResponse = false;
let lastMessageTime = 0;
const MESSAGE_COOLDOWN = 1000; // 1 seconde cooldown tussen berichten

/**
 * BotpressChatClient klasse voor communicatie met de Botpress API
 */
class BotpressChatClient {
    constructor(config) {
        this.webhookId = config.webhookId;
        this.baseUrl = 'https://chat.botpress.cloud';
    }
    
    async checkConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/${this.webhookId}/hello`);
            if (!response.ok) {
                throw new Error(`Error: ${response.status} ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            throw new Error(`Connection error: ${error.message}`);
        }
    }
    
    async createUser(options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/${this.webhookId}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: options.name || `User-${Date.now()}`,
                    tags: options.tags || {}
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Error creating user: ${JSON.stringify(error)}`);
            }
            
            return await response.json();
        } catch (error) {
            throw new Error(`Error creating user: ${error.message}`);
        }
    }
    
    async createConversation(options) {
        try {
            const response = await fetch(`${this.baseUrl}/${this.webhookId}/conversations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': options.userId,
                    'x-user-key': options.userKey
                },
                body: JSON.stringify({
                    type: 'text'
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Error creating conversation: ${JSON.stringify(error)}`);
            }
            
            const data = await response.json();
            console.log('Volledige conversatie response:', data);
            
            // Controleer verschillende mogelijke locaties voor de conversatie ID
            if (data.id) {
                console.log('Conversatie ID direct gevonden in data.id:', data.id);
                return data;
            } 
            
            if (data.conversation && data.conversation.id) {
                console.log('Conversatie ID gevonden in genest object data.conversation.id:', data.conversation.id);
                return data.conversation;
            }
            
            if (data.conversationId) {
                console.log('Conversatie ID gevonden in data.conversationId:', data.conversationId);
                return { id: data.conversationId, ...data };
            }
            
            // Als we hier komen, hebben we geen ID kunnen vinden
            console.error('Geen conversatie ID gevonden in response:', data);
            throw new Error('Kon geen conversatie ID vinden in API response');
            
        } catch (error) {
            throw new Error(`Error creating conversation: ${error.message}`);
        }
    }
    
    async sendMessage(options) {
        try {
            const response = await fetch(`${this.baseUrl}/${this.webhookId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': options.userId,
                    'x-user-key': options.userKey
                },
                body: JSON.stringify({
                    conversationId: options.conversationId,
                    payload: {
                        type: options.payload.type || 'text',
                        text: options.payload.text
                    }
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Error sending message: ${JSON.stringify(error)}`);
            }
            
            return await response.json();
        } catch (error) {
            throw new Error(`Error sending message: ${error.message}`);
        }
    }
    
    async listMessages(options) {
        try {
            const response = await fetch(`${this.baseUrl}/${this.webhookId}/conversations/${options.conversationId}/messages`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': options.userId,
                    'x-user-key': options.userKey
                }
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Error listing messages: ${JSON.stringify(error)}`);
            }
            
            const data = await response.json();
            
            if (!Array.isArray(data)) {
                if (data && typeof data === 'object' && Array.isArray(data.messages)) {
                    return data.messages;
                }
                
                if (data && typeof data === 'object' && Array.isArray(data.results)) {
                    return data.results;
                }
                
                return []; // Retourneer een lege array
            }
            
            return data;
        } catch (error) {
            throw new Error(`Error listing messages: ${error.message}`);
        }
    }
    
    async deleteConversation(options) {
        try {
            const response = await fetch(`${this.baseUrl}/${this.webhookId}/conversations/${options.conversationId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': options.userId,
                    'x-user-key': options.userKey
                }
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Error deleting conversation: ${JSON.stringify(error)}`);
            }
            
            return await response.json();
        } catch (error) {
            throw new Error(`Error deleting conversation: ${error.message}`);
        }
    }
}

/**
 * Hulpfunctie om webhook ID te extraheren
 */
function extractWebhookId(url) {
    if (!url) return null;
    
    if (url.includes('webhook.botpress.cloud/')) {
        return url.split('webhook.botpress.cloud/')[1];
    }
    
    if (url.includes('chat.botpress.cloud/')) {
        return url.split('chat.botpress.cloud/')[1];
    }
    
    if (url.startsWith('http') && url.includes('/')) {
        const parts = url.split('/');
        return parts[parts.length - 1];
    }
    
    return url;
} 