const express = require('express');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('@botpress/chat');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const cookieParser = require('cookie-parser');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3500;

// Supabase configuratie
const supabaseUrl = 'https://clngtypfotklhyekznzi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsbmd0eXBmb3RrbGh5ZWt6bnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIxNjI5MTIsImV4cCI6MjA1NzczODkxMn0.89eVhGEdDrQzQQ82zo_OizlzJ4K9X3xGIliwSOf2H8A';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(cookieParser());

// Sessie configuratie
app.use(session({
    name: 'botpress-app.sid',
    secret: 'super-geheime-sterke-sessie-sleutel-12345',
    resave: true,
    saveUninitialized: true,
    rolling: true, // Vernieuw de cookie bij elke request
    store: new FileStore({
        path: path.join(__dirname, '../data/sessions'),
        ttl: 86400, // 1 dag in seconden
        retries: 3,
        reapInterval: 3600, // Opruimen oude sessies elke uur
    }),
    cookie: {
        secure: false, // Zet op true in productie met HTTPS
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dagen
        path: '/',
        sameSite: 'lax'
    }
}));

// Voeg meer uitgebreide session debug middleware toe
app.use((req, res, next) => {
    const hasSession = !!req.session;
    const hasUser = !!(req.session && req.session.gebruiker);
    const sessionId = req.sessionID || 'no-session-id';
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - SessionID: ${sessionId.substr(0, 6)}... - Gebruiker: ${hasUser ? req.session.gebruiker.username : 'NIET INGELOGD'}`);
    
    // Controleer cookie headers voor debug doeleinden
    const cookies = req.headers.cookie || 'geen cookies';
    console.log(`Cookies: ${cookies}`);
    
    next();
});

// Authenticatie check middleware - meer tolerant
const checkAuth = (req, res, next) => {
    console.log(`[Auth Check] Session ID: ${req.sessionID}, heeft gebruiker: ${!!req.session.gebruiker}`);

    // Als gebruiker is ingelogd, ga verder
    if (req.session && req.session.gebruiker) {
        console.log(`[Auth Check] Gebruiker '${req.session.gebruiker.username}' is ingelogd`);
        return next();
    }
    
    // Check voor authenticatie cookie dat we zelf instellen als backup
    const authCookie = req.cookies['bp-auth-token'];
    if (authCookie === 'admin-auth-token') {
        console.log('[Auth Check] Gebruiker geautoriseerd via backup auth cookie');
        // Herstel de sessie
        req.session.gebruiker = {
            username: 'admin',
            naam: 'Admin Gebruiker',
            rol: 'admin'
        };
        return next();
    }

    console.log('[Auth Check] Niet geautoriseerd');
    return res.status(401).json({ error: 'Niet geautoriseerd' });
};

// Zorg ervoor dat de styling-map bestaat
const STYLING_DIR = path.join(__dirname, '../data/styling');
if (!fs.existsSync(STYLING_DIR)) {
    try {
        fs.mkdirSync(STYLING_DIR, { recursive: true });
        console.log(`Styling directory aangemaakt: ${STYLING_DIR}`);
    } catch (error) {
        console.error(`Kon styling directory niet aanmaken: ${error.message}`);
    }
}

// Helper om te controleren of we in Vercel productie omgeving zitten
const isVercelProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
console.log(`Draait in Vercel productie omgeving: ${isVercelProduction}`);

// In-memory storage voor styling in productie als fallback
const stylingMemoryStorage = new Map();

// Gebruikers voor authenticatie
const gebruikers = {
    admin: {
        wachtwoord: 'admin',
        naam: 'Admin Gebruiker',
        rol: 'admin'
    }
};

// Root route toont configuratie pagina
app.get('/', (req, res) => {
    // Redirect naar login pagina indien niet ingelogd
    if (!req.session || !req.session.gebruiker) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Bot styling route
app.get('/bot-styling', (req, res) => {
    // Redirect naar login pagina indien niet ingelogd
    if (!req.session || !req.session.gebruiker) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, '../public/bot-styling.html'));
});

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
        // Controleer zowel body als header voor userKey
        const userId = req.body.userId;
        const userKey = req.body.userKey || req.headers['x-user-key']; // Accepteer userKey uit zowel body als header
        const webhookId = req.body.webhookId;
        
        if (!userId || !userKey || !webhookId) {
            return res.status(400).json({ error: 'userId, userKey en webhookId zijn verplicht' });
        }
        
        console.log('Aanmaken conversatie met ID:', userId);
        const cleanWebhookId = extractWebhookId(webhookId.trim());
        const client = new Client({ webhookId: cleanWebhookId });
        
        const conversation = await client.createConversation({
            userId,
            userKey
        });
        
        console.log('Conversatie succesvol aangemaakt:', conversation);
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
            return res.status(400).json({ error: 'Alle velden zijn verplicht' });
        }
        
        console.log('Versturen bericht naar conversatie:', conversationId);
        const cleanWebhookId = extractWebhookId(webhookId.trim());
        const client = new Client({ webhookId: cleanWebhookId });
        
        const result = await client.sendMessage({
            conversationId,
            userId,
            userKey,
            payload: {
                type: 'text',
                text
            }
        });
        
        console.log('Bericht succesvol verzonden:', result);
        res.json(result);
    } catch (error) {
        console.error('Error sending message:', error);
        const errorMessage = error.message || 'Er is een fout opgetreden bij het versturen van het bericht';
        res.status(500).json({ error: errorMessage });
    }
});

app.get('/api/messages/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        // Haal de vereiste headers op
        const userKey = req.headers['x-user-key'];
        const webhookId = req.headers['x-webhook-id'];
        const userId = req.headers['x-user-id'];
        
        if (!userKey || !webhookId || !userId) {
            return res.status(400).json({ error: 'x-user-key, x-webhook-id en x-user-id headers zijn verplicht' });
        }
        
        console.log('Ophalen berichten voor conversatie:', conversationId);
        const cleanWebhookId = extractWebhookId(webhookId.trim());
        const client = new Client({ webhookId: cleanWebhookId });
        
        const messages = await client.listMessages({
            conversationId,
            userId,
            userKey
        });
        
        console.log(`${messages.length} berichten opgehaald`);
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        const errorMessage = error.message || 'Er is een fout opgetreden bij het ophalen van berichten';
        res.status(500).json({ error: errorMessage });
    }
});

// Helper functie om webhook ID te extraheren
function extractWebhookId(url) {
    try {
        // Als het een volledige Botpress webhook URL is, extraheer dan alleen het ID
        if (url.includes('webhook.botpress.cloud/')) {
            return url.split('webhook.botpress.cloud/')[1];
        }
        
        // Als het een HTTPS URL is, neem het laatste deel als ID
        if (url.startsWith('https://')) {
            const parts = url.split('/');
            return parts[parts.length - 1];
        }
        
        // Anders neem aan dat het al een pure ID is
        return url;
    } catch (error) {
        console.error('Fout bij extraheren webhook ID:', error);
        // Bij fouten, retourneer de originele input om verder te kunnen
        return url;
    }
}

// API endpoint voor het ophalen van alle bots vanuit Supabase
app.get('/api/bots', async (req, res) => {
    // Controleer of dit een verzoek is voor een specifieke bot
    const botIdFromQuery = req.query.botId;
    
    // Als er geen botId is opgegeven, controleer dan op authenticatie tenzij dit een verzoek is van de chat pagina
    if (!botIdFromQuery && !req.session.gebruiker) {
        return res.status(401).json({ error: 'Niet geautoriseerd' });
    }
    
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
                        webhook_id: "d285e72b-3269-4d44-aebc-e08573bae48f"
                    },
                    {
                        id: "2",
                        name: "SAAM Restaurant Bot",
                        webhook_id: "3d290364-e60d-478a-8396-aedda6747029"
                    }
                ], null, 2));
            }
            
            const localBots = JSON.parse(fs.readFileSync(botsPath, 'utf8'));
            console.log('Lokale bots opgehaald:', localBots);
            
            // Als we een specifieke bot zoeken, filter dan de resultaten
            if (botIdFromQuery) {
                const bot = localBots.find(b => b.id === botIdFromQuery);
                return res.json(bot ? [bot] : []);
            }
            
            return res.json(localBots);
        }
        
        console.log('Bots opgehaald uit Supabase:', data);
        
        // Als we een specifieke bot zoeken, filter dan de resultaten
        if (botIdFromQuery) {
            const bot = data.find(b => b.id === botIdFromQuery);
            return res.json(bot ? [bot] : []);
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching bots:', error);
        
        // Bij een algemene fout, val terug op lokale opslag
        try {
            const botsPath = path.join(__dirname, '../data/bots.json');
            if (fs.existsSync(botsPath)) {
                const localBots = JSON.parse(fs.readFileSync(botsPath, 'utf8'));
                console.log('Lokale bots opgehaald na error:', localBots);
                
                // Als we een specifieke bot zoeken, filter dan de resultaten
                if (botIdFromQuery) {
                    const bot = localBots.find(b => b.id === botIdFromQuery);
                    return res.json(bot ? [bot] : []);
                }
                
                return res.json(localBots);
            }
        } catch (fsError) {
            console.error('Kon ook lokale bots niet ophalen:', fsError);
        }
        
        res.status(500).json({ error: 'Er is een fout opgetreden bij het ophalen van de bots' });
    }
});

// API endpoint voor het toevoegen van een nieuwe bot
app.post('/api/bots', checkAuth, async (req, res) => {
    try {
        const { name, webhook_id } = req.body;

        if (!name || !webhook_id) {
            return res.status(400).json({ error: 'name en webhook_id zijn verplicht' });
        }

        console.log('Toevoegen nieuwe bot:', { name, webhook_id });

        const { data, error } = await supabase
            .from('bots')
            .insert({ name, webhook_id })
            .select()
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Er is een fout opgetreden bij het toevoegen van de bot' });
        }

        console.log('Bot succesvol toegevoegd:', data);
        res.json(data);
    } catch (error) {
        console.error('Error adding bot:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden bij het toevoegen van de bot' });
    }
});

// API endpoint voor het verwijderen van een bot
app.delete('/api/bots/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: 'id is verplicht' });
        }

        console.log('Verwijderen bot:', id);

        const { error } = await supabase
            .from('bots')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Er is een fout opgetreden bij het verwijderen van de bot' });
        }

        // Verwijder ook styling als die bestaat
        const stylingPath = path.join(STYLING_DIR, `${id}.json`);
        if (fs.existsSync(stylingPath)) {
            fs.unlinkSync(stylingPath);
            console.log(`Styling bestand verwijderd: ${stylingPath}`);
        }

        console.log('Bot succesvol verwijderd');
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting bot:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden bij het verwijderen van de bot' });
    }
});

// API endpoint voor het ophalen van styling voor een specifieke bot
app.get('/api/bot-styling/:botId', async (req, res) => {
    try {
        const { botId } = req.params;
        
        if (!botId) {
            console.error('Geen botId opgegeven in de request');
            return res.status(400).json({ error: 'Geen botId opgegeven' });
        }
        
        console.log(`Ophalen styling voor bot ${botId}...`);
        
        // Probeer eerst uit Supabase te halen
        try {
            console.log(`Probeer styling op te halen uit Supabase voor bot ${botId}...`);
            
            const { data, error } = await supabase
                .from('bot_styling')
                .select('styling')
                .eq('bot_id', botId)
                .single();
                
            if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
                console.error(`Supabase error bij ophalen styling: ${error.message}`);
            } else if (data) {
                console.log(`Styling succesvol opgehaald uit Supabase voor bot ${botId}`);
                return res.json(data.styling);
            } else {
                console.log(`Geen styling gevonden in Supabase voor bot ${botId}`);
            }
        } catch (supabaseError) {
            console.error(`Onverwachte fout bij ophalen styling uit Supabase: ${supabaseError.message}`);
        }
        
        // Controleer vervolgens of we de styling in memory hebben (voor Vercel)
        if (isVercelProduction && stylingMemoryStorage.has(botId)) {
            console.log(`Styling opgehaald uit memory storage voor bot ${botId}`);
            return res.json(stylingMemoryStorage.get(botId));
        }
        
        // Als laatste optie proberen we het uit het bestandssysteem te lezen
        const stylingPath = path.join(STYLING_DIR, `${botId}.json`);
        console.log(`Proberen styling te lezen van: ${stylingPath}`);
        
        if (!fs.existsSync(stylingPath)) {
            console.log(`Geen styling gevonden voor bot ${botId}`);
            return res.status(404).json({ error: 'Geen styling gevonden voor deze bot' });
        }

        try {
            const styling = JSON.parse(fs.readFileSync(stylingPath, 'utf8'));
            
            // Sla ook op in memory storage als backup
            if (isVercelProduction) {
                stylingMemoryStorage.set(botId, styling);
            }
            
            console.log(`Styling succesvol opgehaald voor bot ${botId}`);
            return res.json(styling);
        } catch (readError) {
            console.error(`Fout bij lezen styling bestand: ${readError.message}`);
            return res.status(500).json({ error: 'Kon styling bestand niet lezen' });
        }
    } catch (error) {
        console.error('Error fetching bot styling:', error);
        res.status(500).json({ error: `Er is een fout opgetreden bij het ophalen van de bot styling: ${error.message}` });
    }
});

app.post('/api/bot-styling/:botId', checkAuth, async (req, res) => {
    try {
        const { botId } = req.params;
        const styling = req.body;
        
        if (!botId) {
            console.error('Geen botId opgegeven in de request');
            return res.status(400).json({ error: 'Geen botId opgegeven' });
        }
        
        if (!styling) {
            console.error('Geen styling data in request body');
            return res.status(400).json({ error: 'Geen styling data opgegeven' });
        }
        
        console.log(`Opslaan styling voor bot ${botId}...`);
        
        // Probeer eerst op te slaan in Supabase
        try {
            console.log(`Probeer styling op te slaan in Supabase voor bot ${botId}...`);
            
            // Controleer eerst of er al een record bestaat voor deze bot
            const { data: existingData, error: checkError } = await supabase
                .from('bot_styling')
                .select('*')
                .eq('bot_id', botId)
                .single();
                
            if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found"
                console.error(`Supabase error bij controleren bestaande styling: ${checkError.message}`);
            }
            
            let supabaseResult;
            
            if (existingData) {
                // Update bestaande record
                console.log(`Bestaande styling gevonden in Supabase voor bot ${botId}, record bijwerken...`);
                supabaseResult = await supabase
                    .from('bot_styling')
                    .update({ styling: styling, updated_at: new Date() })
                    .eq('bot_id', botId);
            } else {
                // Voeg nieuw record toe
                console.log(`Geen bestaande styling gevonden in Supabase voor bot ${botId}, nieuwe record aanmaken...`);
                supabaseResult = await supabase
                    .from('bot_styling')
                    .insert({ bot_id: botId, styling: styling });
            }
            
            if (supabaseResult.error) {
                console.error(`Fout bij opslaan styling in Supabase: ${supabaseResult.error.message}`);
            } else {
                console.log(`Styling succesvol opgeslagen in Supabase voor bot ${botId}`);
            }
        } catch (supabaseError) {
            console.error(`Onverwachte fout bij opslaan styling in Supabase: ${supabaseError.message}`);
        }
        
        // Als we in Vercel productie draaien, sla dan op in memory als backup
        if (isVercelProduction) {
            console.log(`Styling opslaan in memory storage voor bot ${botId}`);
            stylingMemoryStorage.set(botId, styling);
            console.log('Styling succesvol opgeslagen in memory');
            return res.json({ success: true });
        }
        
        // Anders proberen we naar het bestandssysteem te schrijven
        // Controleer of de styling map bestaat
        if (!fs.existsSync(STYLING_DIR)) {
            console.log('Styling map bestaat niet, wordt aangemaakt...');
            fs.mkdirSync(STYLING_DIR, { recursive: true });
        }
        
        const stylingPath = path.join(STYLING_DIR, `${botId}.json`);
        console.log(`Schrijven naar bestand: ${stylingPath}`);
        
        // Schrijf het bestand synchroon om problemen te voorkomen
        fs.writeFileSync(stylingPath, JSON.stringify(styling, null, 2));
        console.log('Styling succesvol opgeslagen in bestand');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving bot styling:', error);
        res.status(500).json({ error: `Er is een fout opgetreden bij het opslaan van de bot styling: ${error.message}` });
    }
});

// API endpoint voor het bijwerken van een bot
app.put('/api/bots/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, webhook_id } = req.body;

        if (!id || !name || !webhook_id) {
            return res.status(400).json({ error: 'id, name en webhook_id zijn verplicht' });
        }

        console.log('Bijwerken bot:', { id, name, webhook_id });

        const { data, error } = await supabase
            .from('bots')
            .update({ name, webhook_id })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(500).json({ error: 'Er is een fout opgetreden bij het bijwerken van de bot' });
        }

        console.log('Bot succesvol bijgewerkt:', data);
        res.json(data);
    } catch (error) {
        console.error('Error updating bot:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden bij het bijwerken van de bot' });
    }
});

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
    try {
        const username = req.body.username;
        const password = req.body.password;
        
        console.log('Login poging ontvangen:', { username, password });
        
        if (!username || !password) {
            console.log('Ontbrekende gebruikersnaam of wachtwoord');
            return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn verplicht' });
        }
        
        if (gebruikers[username] && gebruikers[username].wachtwoord === password) {
            const gebruiker = {
                username,
                naam: gebruikers[username].naam,
                rol: gebruikers[username].rol
            };
            
            // Sla de gebruiker op in de sessie
            req.session.gebruiker = gebruiker;
            
            // Stel ook een backup auth cookie in voor noodgevallen
            res.cookie('bp-auth-token', 'admin-auth-token', {
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dagen
                httpOnly: true,
                path: '/',
                sameSite: 'lax'
            });
            
            console.log(`Gebruiker ${username} succesvol ingelogd, session ID: ${req.sessionID}`);
            res.status(200).json({ 
                success: true, 
                gebruiker,
                message: 'Login succesvol'
            });
        } else {
            console.log(`Mislukte login poging voor ${username}`);
            res.status(401).json({ error: 'Ongeldige gebruikersnaam of wachtwoord' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden tijdens het inloggen' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout fout:', err);
            return res.status(500).json({ error: 'Er is een fout opgetreden bij het uitloggen' });
        }
        res.json({ success: true, message: 'Uitgelogd' });
    });
});

app.get('/api/auth/check', (req, res) => {
    if (req.session && req.session.gebruiker) {
        res.json({ 
            isAuthenticated: true, 
            gebruiker: req.session.gebruiker 
        });
    } else {
        res.json({ isAuthenticated: false });
    }
});

app.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.gebruiker) {
        res.json({ user: req.session.gebruiker });
    } else {
        res.status(401).json({ error: 'Niet ingelogd' });
    }
});

// Proxy endpoint om CORS-problemen te omzeilen
app.get('/api/proxy/botpress/test/:webhookId', async (req, res) => {
  try {
    const { webhookId } = req.params;
    console.log(`Testing Botpress webhook connection: ${webhookId}`);
    
    const response = await fetch(`https://chat.botpress.cloud/${webhookId}/hello`);
    const data = await response.text();
    
    res.status(response.status).send(data);
  } catch (error) {
    console.error('Error proxying Botpress webhook test:', error);
    res.status(500).send({ error: error.message });
  }
});

// Botpress API proxy endpoints
app.post('/api/proxy/botpress/users', async (req, res) => {
  try {
    const response = await fetch('https://chat.botpress.cloud/api/v1/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error proxying Botpress user creation:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proxy/botpress/conversations', async (req, res) => {
  try {
    const response = await fetch('https://chat.botpress.cloud/api/v1/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': req.headers['x-user-id'],
        'x-user-key': req.headers['x-user-key']
      },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error proxying Botpress conversation creation:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proxy/botpress/messages', async (req, res) => {
  try {
    const response = await fetch('https://chat.botpress.cloud/api/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': req.headers['x-user-id'],
        'x-user-key': req.headers['x-user-key']
      },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error proxying Botpress message creation:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/proxy/botpress/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.headers['x-user-id'];
    const userKey = req.headers['x-user-key'];

    console.log(`Fetching messages for conversation: ${conversationId}`);
    console.log(`Headers: user-id: ${userId}, has-user-key: ${Boolean(userKey)}`);
    
    const response = await fetch(`https://chat.botpress.cloud/api/v1/conversations/${conversationId}/messages`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-user-key': userKey
      }
    });
    
    console.log(`Botpress API response status: ${response.status}`);
    
    const rawResponseText = await response.text();
    console.log(`Raw response: ${rawResponseText.substring(0, 200)}${rawResponseText.length > 200 ? '...' : ''}`);
    
    let data;
    try {
      data = JSON.parse(rawResponseText);
    } catch (parseError) {
      console.error(`Error parsing JSON response: ${parseError.message}`);
      data = [];
    }
    
    // Zorg dat we altijd een array teruggeven
    const messages = Array.isArray(data) ? data : [];
    console.log(`Returning ${messages.length} messages`);
    
    res.status(response.status).json(messages);
  } catch (error) {
    console.error('Error proxying Botpress messages fetch:', error);
    // Bij een fout sturen we een lege array terug om client-side fouten te voorkomen
    res.status(200).json([]);
  }
});

app.delete('/api/proxy/botpress/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const response = await fetch(`https://chat.botpress.cloud/api/v1/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': req.headers['x-user-id'],
        'x-user-key': req.headers['x-user-key']
      }
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error proxying Botpress conversation deletion:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start de server
app.listen(PORT, () => {
    console.log(`Server draait op http://localhost:${PORT}`);
});