const express = require('express');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('@botpress/chat');

const app = express();
const PORT = process.env.PORT || 3500;

// Supabase configuratie
const supabaseUrl = 'https://clngtypfotklhyekznzi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsbmd0eXBmb3RrbGh5ZWt6bnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIxNjI5MTIsImV4cCI6MjA1NzczODkxMn0.89eVhGEdDrQzQQ82zo_OizlzJ4K9X3xGIliwSOf2H8A';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// Zorg ervoor dat de styling-map bestaat
const STYLING_DIR = path.join(__dirname, '../data/styling');
if (!fs.existsSync(STYLING_DIR)) {
    fs.mkdirSync(STYLING_DIR, { recursive: true });
}

// Root route toont configuratie pagina
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Bot styling route
app.get('/bot-styling', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/bot-styling.html'));
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

// API endpoint voor het ophalen van alle bots vanuit Supabase
app.get('/api/bots', async (req, res) => {
    try {
        console.log('Ophalen bots van Supabase...');
        
        // Probeer eerst bots op te halen uit Supabase
        const { data, error } = await supabase
            .from('bots')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase error:', error);
            
            // Als Supabase faalt, val terug op lokaal opgeslagen bots
            console.log('Vallen terug op lokale bots...');
            const botsPath = path.join(__dirname, '../data/bots.json');
            
            if (!fs.existsSync(botsPath)) {
                fs.writeFileSync(botsPath, JSON.stringify([
                    {
                        id: "1",
                        name: "MECC Support",
                        webhookId: "d285e72b-3269-4d44-aebc-e08573bae48f"
                    },
                    {
                        id: "2",
                        name: "SAAM Restaurant Bot",
                        webhookId: "3d290364-e60d-478a-8396-aedda6747029"
                    }
                ], null, 2));
            }
            
            const localBots = JSON.parse(fs.readFileSync(botsPath, 'utf8'));
            console.log('Lokale bots opgehaald:', localBots);
            return res.json(localBots);
        }
        
        console.log('Bots opgehaald uit Supabase:', data);
        res.json(data);
    } catch (error) {
        console.error('Error fetching bots:', error);
        
        // Bij een algemene fout, val terug op lokale opslag
        try {
            const botsPath = path.join(__dirname, '../data/bots.json');
            if (fs.existsSync(botsPath)) {
                const localBots = JSON.parse(fs.readFileSync(botsPath, 'utf8'));
                console.log('Lokale bots opgehaald na error:', localBots);
                return res.json(localBots);
            }
        } catch (fsError) {
            console.error('Kon ook lokale bots niet ophalen:', fsError);
        }
        
        res.status(500).json({ error: 'Er is een fout opgetreden bij het ophalen van de bots' });
    }
});

// Bot styling API endpoints (blijft met lokale bestanden werken)
app.get('/api/bot-styling/:botId', (req, res) => {
    try {
        const { botId } = req.params;
        const stylingPath = path.join(STYLING_DIR, `${botId}.json`);

        if (!fs.existsSync(stylingPath)) {
            return res.status(404).json({ error: 'Geen styling gevonden voor deze bot' });
        }

        const styling = JSON.parse(fs.readFileSync(stylingPath, 'utf8'));
        res.json(styling);
    } catch (error) {
        console.error('Error fetching bot styling:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden bij het ophalen van de bot styling' });
    }
});

app.post('/api/bot-styling/:botId', (req, res) => {
    try {
        const { botId } = req.params;
        const styling = req.body;
        
        const stylingPath = path.join(STYLING_DIR, `${botId}.json`);
        fs.writeFileSync(stylingPath, JSON.stringify(styling, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving bot styling:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden bij het opslaan van de bot styling' });
    }
});

app.listen(PORT, () => {
    console.log(`Server draait op http://localhost:${PORT}`);
}); 