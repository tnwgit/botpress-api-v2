const express = require('express');
const path = require('path');
const { Client } = require('@botpress/chat');

const app = express();

app.use(express.json());
app.use(express.static('public'));

// Root route toont configuratie pagina
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/config.html'));
});

// Helper functie om webhook ID te extraheren
function extractWebhookId(url) {
    try {
        if (url.includes('webhook.botpress.cloud/')) {
            return url.split('webhook.botpress.cloud/')[1];
        }
        return url;
    } catch (error) {
        console.error('Fout bij extraheren webhook ID:', error);
        return url;
    }
}

// API endpoints
app.post('/api/user', async (req, res) => {
    try {
        const { webhookId } = req.body;
        if (!webhookId) {
            return res.status(400).json({ error: 'webhookId is verplicht' });
        }

        console.log('Ontvangen webhookId:', webhookId);
        const cleanWebhookId = extractWebhookId(webhookId.trim());
        console.log('Geëxtraheerde webhookId:', cleanWebhookId);

        const client = new Client({ webhookId: cleanWebhookId });
        
        console.log('Client created, attempting to create user...');
        const response = await client.createUser({
            name: `User-${Date.now()}`,
            tags: {
                source: 'web-chat'
            }
        });
        console.log('Gebruiker succesvol aangemaakt:', response);
        res.json({
            user: response.user,
            key: response.key
        });
    } catch (error) {
        console.error('Error creating user:', error);
        const errorMessage = error.message || 'Er is een fout opgetreden bij het aanmaken van de gebruiker';
        res.status(500).json({ error: errorMessage });
    }
});

app.post('/api/conversation', async (req, res) => {
    try {
        const { userId, userKey, webhookId } = req.body;
        if (!userId || !userKey || !webhookId) {
            return res.status(400).json({ error: 'userId, userKey en webhookId zijn verplicht' });
        }

        console.log('Nieuwe conversatie aangemaakt voor gebruiker:', userId);
        
        // Extraheer de webhook ID uit de URL als het een volledige URL is
        const cleanWebhookId = webhookId.includes('webhook.botpress.cloud/') 
            ? webhookId.split('webhook.botpress.cloud/')[1] 
            : webhookId;

        console.log('Gebruik webhook ID:', cleanWebhookId);
        
        const client = new Client({ 
            webhookId: cleanWebhookId,
            headers: {
                'x-user-key': userKey
            }
        });

        const { conversation } = await client.createConversation({
            userId: userId
        });
        console.log('Conversation created:', conversation);
        res.json(conversation);
    } catch (error) {
        console.error('Error creating conversation:', error);
        const errorMessage = error.message || 'Er is een fout opgetreden bij het aanmaken van de conversatie';
        res.status(500).json({ error: errorMessage });
    }
});

app.post('/api/message', async (req, res) => {
    try {
        const { userId, userKey, conversationId, text, webhookId } = req.body;
        
        if (!userId || !userKey || !conversationId || !text || !webhookId) {
            return res.status(400).json({ error: 'userId, userKey, conversationId, webhookId en text zijn verplicht' });
        }

        // Extraheer de webhook ID uit de URL als het een volledige URL is
        const cleanWebhookId = webhookId.includes('webhook.botpress.cloud/') 
            ? webhookId.split('webhook.botpress.cloud/')[1] 
            : webhookId;

        console.log('Sending message:', { userId, conversationId, text, webhookId: cleanWebhookId });

        const client = new Client({
            webhookId: cleanWebhookId,
            headers: {
                'x-user-key': userKey
            }
        });

        // Voeg eerst de gebruiker toe aan de conversatie
        await client.addParticipant({
            conversationId,
            userId
        });

        // Stuur dan het bericht
        const result = await client.createMessage({
            conversationId,
            payload: {
                type: 'text',
                text: text,
            },
        });
        console.log('Message sent:', result);
        res.json({ success: true, result });
    } catch (error) {
        console.error('Error sending message:', error);
        const errorMessage = error.message || 'Er is een fout opgetreden bij het versturen van het bericht';
        res.status(500).json({ error: errorMessage });
    }
});

app.get('/api/messages/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userKey = req.headers['x-user-key'];
        const webhookId = req.headers['x-webhook-id'];
        const userId = req.headers['x-user-id'];
        
        if (!userKey || !conversationId || !webhookId || !userId) {
            return res.status(400).json({ error: 'userKey, userId (in headers), webhookId (in headers) en conversationId zijn verplicht' });
        }

        const cleanWebhookId = extractWebhookId(webhookId.trim());
        console.log('Fetching messages for conversation:', conversationId);

        const client = new Client({ 
            webhookId: cleanWebhookId,
            headers: {
                'x-user-key': userKey
            }
        });

        // Voeg de gebruiker toe aan de conversatie
        try {
            await client.addParticipant({
                conversationId,
                userId
            });
            console.log('Gebruiker toegevoegd aan conversatie');
        } catch (error) {
            console.log('Fout bij toevoegen gebruiker aan conversatie (mogelijk al toegevoegd):', error.message);
        }

        // Haal nu de berichten op
        const { messages } = await client.listMessages({ 
            conversationId
        });
        console.log('Messages fetched:', messages);
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        const errorMessage = error.message || 'Er is een fout opgetreden bij het ophalen van berichten';
        res.status(500).json({ error: errorMessage });
    }
});

// Voor lokale ontwikkeling
if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 3500;
    app.listen(port, () => {
        console.log(`Server draait op http://localhost:${port}`);
    });
}

// Voor Vercel
module.exports = app; 