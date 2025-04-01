/**
 * Botpress Chat API Client
 * 
 * Dit bestand bevat alle functionaliteit voor communicatie met de Botpress Chat API.
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
                    ...(options.tags && { tags: options.tags })
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Error creating user: ${JSON.stringify(error)}`);
            }
            
            const data = await response.json();
            
            // Extraheer het user ID - inspecteeer de JWT token om het ID eruit te halen
            let userId = null;
            
            if (data && data.key) {
                try {
                    // Het ID zit in de JWT token payload
                    const tokenParts = data.key.split('.');
                    if (tokenParts.length >= 2) {
                        const tokenPayload = atob(tokenParts[1].replace(/-/g, '+').replace(/_/g, '/'));
                        const payloadObj = JSON.parse(tokenPayload);
                        userId = payloadObj.id;
                    }
                } catch (e) {
                    console.error('Kon user ID niet uit token halen:', e);
                }
            }
            
            // Gebruik het gevonden ID of een fallback
            userId = userId || data.id || 'unknown_user_id';
            const userKey = data.key || '';
            
            return {
                user: { id: userId },
                key: userKey
            };
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
                    'x-user-key': options.userKey,
                    'accept': 'application/json'
                },
                body: JSON.stringify({}) // Lege body toevoegen
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Error creating conversation: ${JSON.stringify(error)}`);
            }
            
            const data = await response.json();
            
            // Controleer of het ID bestaat in de response
            if (!data.id) {
                // Zoek naar een id veld in de response
                let conversationId = null;
                if (data && typeof data === 'object') {
                    // Probeer het id te vinden, ongeacht de hoofdletters
                    for (const key in data) {
                        if (key.toLowerCase() === 'id') {
                            conversationId = data[key];
                            break;
                        }
                    }
                    
                    // Als er geen direct id veld is, check geneste objecten
                    if (!conversationId) {
                        for (const key in data) {
                            if (typeof data[key] === 'object' && data[key] !== null && data[key].id) {
                                conversationId = data[key].id;
                                break;
                            }
                        }
                    }
                }
                
                if (conversationId) {
                    return { id: conversationId };
                }
                
                throw new Error('Kon geen conversatie ID vinden in de response');
            }
            
            return data;
        } catch (error) {
            throw new Error(`Error creating conversation: ${error.message}`);
        }
    }
    
    async sendMessage(options) {
        try {
            // Controleer of conversationId is gedefinieerd
            if (!options.conversationId) {
                throw new Error('conversationId is required but was undefined');
            }
            
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
            
            const data = await response.json();
            return data;
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
            
            // Controleer of de data een array is
            if (!Array.isArray(data)) {
                // Als het een object is met een messages property die een array is
                if (data && typeof data === 'object' && Array.isArray(data.messages)) {
                    return data.messages;
                }
                
                // Als het een object is met een results property die een array is (alternatief format)
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
            
            const data = await response.json();
            return data;
        } catch (error) {
            throw new Error(`Error deleting conversation: ${error.message}`);
        }
    }
}

// Helper functie om webhook ID te extraheren
function extractWebhookId(input) {
    if (!input) return null;
    
    // Als het een volledige webhook.botpress.cloud URL is
    if (input.includes('webhook.botpress.cloud/')) {
        return input.split('webhook.botpress.cloud/')[1].split('/')[0];
    }
    
    // Als het een volledige chat.botpress.cloud URL is
    if (input.includes('chat.botpress.cloud/')) {
        return input.split('chat.botpress.cloud/')[1].split('/')[0];
    }
    
    // Als het een URL is met een ID aan het eind
    if (input.startsWith('http') && input.includes('/')) {
        const parts = input.split('/');
        return parts[parts.length - 1];
    }
    
    // Anders is het waarschijnlijk al een pure ID
    return input;
}

// Exporteer de klasse en functies
export { BotpressChatClient, extractWebhookId }; 