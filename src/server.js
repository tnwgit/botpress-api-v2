// Laad environment variabelen
require('dotenv').config();

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
const multer = require('multer');
const crypto = require('crypto');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3500;

// Supabase configuratie
const supabaseUrl = process.env.SUPABASE_URL || 'https://clngtypfotklhyekznzi.supabase.co';
const supabaseKey = process.env.SUPABASE_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsbmd0eXBmb3RrbGh5ZWt6bnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIxNjI5MTIsImV4cCI6MjA1NzczODkxMn0.89eVhGEdDrQzQQ82zo_OizlzJ4K9X3xGIliwSOf2H8A';
// Expose values to the environment for other parts of the application to use
process.env.SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_API_KEY = supabaseKey;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(cookieParser());

// Voeg expliciete route toe voor CSS files met correct MIME type
app.get('/css/:file', (req, res) => {
    const cssFile = path.join(__dirname, '../public/css', req.params.file);
    res.type('text/css');
    res.sendFile(cssFile);
});

// Bescherm alle HTML paginas behalve login.html
app.use((req, res, next) => {
    // Skip deze middleware voor de login pagina en assets
    if (req.path === '/login.html' || 
        req.path.startsWith('/css/') || 
        req.path.startsWith('/js/') || 
        req.path.startsWith('/api/') ||
        !req.path.endsWith('.html')) {
        return next();
    }

    // Check voor geldige sessie
    if (!req.session || !req.session.gebruiker) {
        console.log(`[Auth] Toegang geweigerd tot ${req.path} - Geen geldige sessie`);
        // Behoud de query parameters in de redirect
        const redirectUrl = req.url.includes('?') ? req.url : req.path;
        return res.redirect('/login.html?redirect=' + encodeURIComponent(redirectUrl));
    }

    // Check voor JWT token in de Authorization header als extra validatie
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.substring(7);
            const decodedData = JSON.parse(Buffer.from(token, 'base64').toString());
            
            // Check of de token niet verlopen is
            if (!decodedData || !decodedData.exp || decodedData.exp <= Date.now()) {
                console.log('[Auth] Token is verlopen of ongeldig');
                return res.redirect('/login.html?redirect=' + encodeURIComponent(req.url));
            }
        } catch (e) {
            console.error('Fout bij verwerken token:', e);
        }
    }

    next();
});

// Helper om te controleren of we in Vercel productie omgeving zitten
const isVercelProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
console.log(`Draait in Vercel productie omgeving: ${isVercelProduction}`);

// Definieer de basis URLs voor lokale ontwikkeling en productie
const LOCAL_BASE_URL = `http://localhost:${PORT}`;
const PRODUCTION_BASE_URL = process.env.PRODUCTION_URL || 'https://botpress-api-v2.vercel.app';

// Helper functie om de juiste URL te genereren voor de chat-klant pagina
function getChatClientUrl(botId) {
    const baseUrl = isVercelProduction ? PRODUCTION_BASE_URL : LOCAL_BASE_URL;
    return `${baseUrl}/chat-klant.html?botId=${botId}`;
}

// Sessie configuratie
app.use(session({
    name: 'botpress-app.sid',
    secret: 'super-geheime-sterke-sessie-sleutel-12345',
    resave: true,
    saveUninitialized: true,
    rolling: true, // Vernieuw de cookie bij elke request
    store: isVercelProduction ? 
        // In-memory store voor Vercel
        new session.MemoryStore() : 
        // Bestandsopslag voor lokale ontwikkeling
        new FileStore({
            path: path.join(__dirname, '../data/sessions'),
            ttl: 86400, // 1 dag in seconden
            retries: 3,
            reapInterval: 3600, // Opruimen oude sessies elke uur
        }),
    cookie: {
        secure: isVercelProduction, // True in productie met HTTPS
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
    // Extra veiligheidscontrole om 'undefined' fouten te voorkomen
    if (!req.session) {
        console.log('[Auth Check] Geen sessie beschikbaar');
        
        // Check voor authenticatie cookie als fallback
        const authCookie = req.cookies && req.cookies['bp-auth-token'];
        if (authCookie === 'admin-auth-token') {
            console.log('[Auth Check] Gebruiker geautoriseerd via backup auth cookie');
            // Maak een nieuwe sessie aan als die niet bestaat
            req.session = req.session || {};
            req.session.gebruiker = {
                username: 'admin',
                naam: 'Admin Gebruiker',
                rol: 'admin'
            };
            return next();
        }
        
        // Check voor JWT token in de Authorization header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.substring(7); // Verwijder 'Bearer ' prefix
                const decodedData = JSON.parse(Buffer.from(token, 'base64').toString());
                
                // Check of de token niet verlopen is
                if (decodedData && decodedData.exp && decodedData.exp > Date.now()) {
                    console.log('[Auth Check] Gebruiker geautoriseerd via JWT token');
                    req.session = req.session || {};
                    req.session.gebruiker = {
                        username: decodedData.username,
                        naam: decodedData.naam,
                        rol: decodedData.rol
                    };
                    return next();
                }
            } catch (e) {
                console.error('Fout bij verwerken token:', e);
            }
        }
        
        return res.status(401).json({ error: 'Sessie verlopen of niet beschikbaar' });
    }
    
    console.log(`[Auth Check] Session ID: ${req.sessionID || 'geen-id'}, heeft gebruiker: ${!!(req.session && req.session.gebruiker)}`);

    // Als gebruiker is ingelogd, ga verder
    if (req.session && req.session.gebruiker) {
        console.log(`[Auth Check] Gebruiker '${req.session.gebruiker.username}' is ingelogd`);
        return next();
    }
    
    // Check voor authenticatie cookie dat we zelf instellen als backup
    const authCookie = req.cookies && req.cookies['bp-auth-token'];
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
    
    // Check voor JWT token in de Authorization header (extra check voor het geval de sessie bestaat maar leeg is)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.substring(7); // Verwijder 'Bearer ' prefix
            const decodedData = JSON.parse(Buffer.from(token, 'base64').toString());
            
            // Check of de token niet verlopen is
            if (decodedData && decodedData.exp && decodedData.exp > Date.now()) {
                console.log('[Auth Check] Gebruiker geautoriseerd via JWT token');
                req.session.gebruiker = {
                    username: decodedData.username,
                    naam: decodedData.naam,
                    rol: decodedData.rol
                };
                return next();
            }
        } catch (e) {
            console.error('Fout bij verwerken token:', e);
        }
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
    // De gebruiker heeft mogelijk een geldige auth cookie of token, maar geen sessie
    // Controleer alle mogelijke authenticatiebronnen voordat we redirecten
    
    // 1. Controleer sessie
    if (req.session && req.session.gebruiker) {
        console.log('Root route: gebruiker ingelogd via sessie');
        return res.sendFile(path.join(__dirname, '../public/index.html'));
    }
    
    // 2. Controleer auth cookie
    const authCookie = req.cookies && req.cookies['bp-auth-token'];
    if (authCookie === 'admin-auth-token') {
        console.log('Root route: gebruiker geautoriseerd via auth cookie');
        // Herstel de sessie
        req.session.gebruiker = {
            username: 'admin',
            naam: 'Admin Gebruiker',
            rol: 'admin'
        };
        return res.sendFile(path.join(__dirname, '../public/index.html'));
    }
    
    // 3. Controleer JWT token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.substring(7);
            const decodedData = JSON.parse(Buffer.from(token, 'base64').toString());
            
            if (decodedData && decodedData.exp && decodedData.exp > Date.now()) {
                console.log('Root route: gebruiker geautoriseerd via JWT token');
                req.session.gebruiker = {
                    username: decodedData.username,
                    naam: decodedData.naam,
                    rol: decodedData.rol
                };
                return res.sendFile(path.join(__dirname, '../public/index.html'));
            }
        } catch (e) {
            console.error('Fout bij verwerken token:', e);
        }
    }
    
    // Geen geldige authenticatie gevonden
    console.log('Root route: geen geldige authenticatie, doorsturen naar login');
    return res.redirect('/login.html?redirect=' + encodeURIComponent('/'));
});

// Bot styling route
app.get('/bot-styling', (req, res) => {
    // De gebruiker heeft mogelijk een geldige auth cookie of token, maar geen sessie
    // Controleer alle mogelijke authenticatiebronnen voordat we redirecten
    
    // 1. Controleer sessie
    if (req.session && req.session.gebruiker) {
        console.log('Bot styling: gebruiker ingelogd via sessie');
        return res.sendFile(path.join(__dirname, '../public/bot-styling.html'));
    }
    
    // 2. Controleer auth cookie
    const authCookie = req.cookies && req.cookies['bp-auth-token'];
    if (authCookie === 'admin-auth-token') {
        console.log('Bot styling: gebruiker geautoriseerd via auth cookie');
        // Herstel de sessie
        req.session.gebruiker = {
            username: 'admin',
            naam: 'Admin Gebruiker',
            rol: 'admin'
        };
        return res.sendFile(path.join(__dirname, '../public/bot-styling.html'));
    }
    
    // 3. Controleer JWT token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.substring(7);
            const decodedData = JSON.parse(Buffer.from(token, 'base64').toString());
            
            if (decodedData && decodedData.exp && decodedData.exp > Date.now()) {
                console.log('Bot styling: gebruiker geautoriseerd via JWT token');
                req.session.gebruiker = {
                    username: decodedData.username,
                    naam: decodedData.naam,
                    rol: decodedData.rol
                };
                return res.sendFile(path.join(__dirname, '../public/bot-styling.html'));
            }
        } catch (e) {
            console.error('Fout bij verwerken token:', e);
        }
    }
    
    // Geen geldige authenticatie gevonden
    console.log('Bot styling: geen geldige authenticatie, doorsturen naar login');
    return res.redirect('/login.html?redirect=' + encodeURIComponent('/bot-styling'));
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

// API routes voor bot styling ophalen
app.get('/api/bots', async (req, res) => {
    const sessionId = req.session.id ? req.session.id.substring(0, 7) + '...' : 'none';
    console.log(`[${new Date().toISOString()}] GET /api/bots - SessionID: ${sessionId} - Gebruiker: ${req.session?.gebruiker?.username}`);
    console.log('Cookies:', req.headers.cookie);    
    
    try {
        console.log('Ophalen bots van Supabase...');
        
        // Instellen van headers
        const supaHeaders = {};
        // API key toevoegen als die bestaat
        if (process.env.SUPABASE_API_KEY) {
            supaHeaders['apikey'] = process.env.SUPABASE_API_KEY;
            supaHeaders['Authorization'] = `Bearer ${process.env.SUPABASE_API_KEY}`;
        }
        
        // Voeg extra debug info toe aan response om problemen te kunnen diagnosticeren
        let debugInfo = {
            useSupabase: !!process.env.SUPABASE_URL,
            supabaseUrl: process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL}/rest/v1/bots` : null,
            hasApiKey: !!process.env.SUPABASE_API_KEY,
            sessionExists: !!req.session,
            userInSession: !!req.session?.gebruiker,
            userDetails: req.session?.gebruiker ? {
                username: req.session.gebruiker.username,
                rol: req.session.gebruiker.rol
            } : null
        };
        
        let bots = [];
        
        // Als Supabase URL is ingesteld, haal bots op uit Supabase
        if (process.env.SUPABASE_URL) {
            const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bots?select=*`, {
                headers: supaHeaders
            });
            
            // Als de response niet OK is, log de fout
            if (!response.ok) {
                console.error('Fout bij ophalen bots uit Supabase:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('Error response:', errorText);
                debugInfo.supabaseError = {
                    status: response.status,
                    statusText: response.statusText,
                    errorText: errorText
                };
            } else {
                bots = await response.json();
                console.log('Bots opgehaald uit Supabase:', bots);
            }
        } else {
            // Fallback naar lokale JSON file als er geen Supabase URL is
            console.log('Geen Supabase URL geconfigureerd, gebruikt lokale bots.json');
            try {
                const botsData = fs.readFileSync(path.join(__dirname, '../data/bots.json'), 'utf8');
                bots = JSON.parse(botsData);
                debugInfo.usingLocalFile = true;
            } catch (fileError) {
                console.error('Fout bij lezen van lokale bots.json:', fileError);
                debugInfo.localFileError = fileError.message;
            }
        }
        
        res.json({
            bots: bots,
            _debug: debugInfo
        });
    } catch (error) {
        console.error('Fout bij ophalen bots:', error);
        res.status(500).json({ 
            error: 'Fout bij ophalen bots', 
            message: error.message,
            _debug: debugInfo
        });
    }
});

// Nieuwe route voor het ophalen van één specifieke bot op basis van ID
app.get('/api/bots/:id', async (req, res) => {
    const { id } = req.params;
    const sessionId = req.session?.id ? req.session.id.substring(0, 7) + '...' : 'none';
    
    console.log(`[${new Date().toISOString()}] GET /api/bots/${id} - SessionID: ${sessionId} - Gebruiker: ${req.session?.gebruiker?.username || 'niet ingelogd'}`);
    
    try {
        console.log(`Ophalen bot met ID ${id} van Supabase...`);
        
        // Instellen van headers
        const supaHeaders = {};
        if (process.env.SUPABASE_API_KEY) {
            supaHeaders['apikey'] = process.env.SUPABASE_API_KEY;
            supaHeaders['Authorization'] = `Bearer ${process.env.SUPABASE_API_KEY}`;
        }
        
        let bot = null;
        
        // Eerst proberen van Supabase te halen
        if (process.env.SUPABASE_URL) {
            console.log(`Ophalen bot van Supabase met URL: ${process.env.SUPABASE_URL}/rest/v1/bots?id=eq.${id}&select=*`);
            const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bots?id=eq.${id}&select=*`, {
                headers: supaHeaders
            });
            
            if (!response.ok) {
                console.error(`Fout bij ophalen bot ${id} uit Supabase:`, response.status, response.statusText);
                const errorText = await response.text();
                console.error('Error response:', errorText);
            } else {
                const bots = await response.json();
                console.log(`Bot zoekresultaat uit Supabase:`, bots);
                
                if (bots && bots.length > 0) {
                    bot = bots[0];
                    console.log(`Bot ${id} gevonden in Supabase:`, bot);
                } else {
                    console.log(`Geen bot gevonden met ID ${id} in Supabase`);
                }
            }
        } else {
            // Fallback naar lokale JSON file
            console.log('Geen Supabase URL geconfigureerd, gebruikt lokale bots.json');
            try {
                const botsData = fs.readFileSync(path.join(__dirname, '../data/bots.json'), 'utf8');
                const bots = JSON.parse(botsData);
                bot = bots.find(b => b.id === id);
                
                if (bot) {
                    console.log(`Bot ${id} gevonden in lokaal bestand:`, bot);
                } else {
                    console.log(`Geen bot gevonden met ID ${id} in lokaal bestand`);
                }
            } catch (fileError) {
                console.error('Fout bij lezen van lokale bots.json:', fileError);
            }
        }
        
        if (!bot) {
            console.log(`Bot met ID ${id} niet gevonden`);
            return res.status(404).json({ error: `Bot niet gevonden: ${id}` });
        }
        
        // Haal ook de styling op voor de bot
        try {
            const styling = await fetchBotStyling(id);
            if (styling) {
                bot.styling = styling;
                console.log(`Styling toegevoegd aan bot ${id}`);
            }
        } catch (stylingError) {
            console.error(`Fout bij ophalen styling voor bot ${id}:`, stylingError);
            // Fout bij styling ophalen is niet kritiek, dus we gaan door
        }
        
        // Voeg de chat client URLs toe aan de bot data
        bot.chatClientUrls = {
            local: getChatClientUrl(id),
            production: `${PRODUCTION_BASE_URL}/chat-klant.html?botId=${id}`
        };
        
        res.json(bot);
        
    } catch (error) {
        console.error(`Fout bij ophalen bot ${id}:`, error);
        res.status(500).json({ 
            error: `Fout bij ophalen bot ${id}`, 
            message: error.message
        });
    }
});

// Helper-functie voor het ophalen van bot styling
async function fetchBotStyling(botId) {
    try {
        // Probeer eerst uit Supabase te halen
        if (process.env.SUPABASE_URL) {
            console.log(`Probeer styling op te halen uit Supabase voor bot ${botId}...`);
            
            const supaHeaders = {};
            if (process.env.SUPABASE_API_KEY) {
                supaHeaders['apikey'] = process.env.SUPABASE_API_KEY;
                supaHeaders['Authorization'] = `Bearer ${process.env.SUPABASE_API_KEY}`;
            }
            
            const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bot_styling?bot_id=eq.${botId}&select=styling`, {
                headers: supaHeaders
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0 && data[0].styling) {
                    console.log(`Styling gevonden in Supabase voor bot ${botId}`);
                    return data[0].styling;
                }
            }
        }
        
        // Controleer of we de styling in memory hebben (voor Vercel)
        if (isVercelProduction && stylingMemoryStorage.has(botId)) {
            console.log(`Styling opgehaald uit memory storage voor bot ${botId}`);
            return stylingMemoryStorage.get(botId);
        }
        
        // Als laatste optie proberen we het uit het bestandssysteem te lezen
        const stylingPath = path.join(STYLING_DIR, `${botId}.json`);
        console.log(`Proberen styling te lezen van: ${stylingPath}`);
        
        if (fs.existsSync(stylingPath)) {
            const styling = JSON.parse(fs.readFileSync(stylingPath, 'utf8'));
            console.log(`Styling succesvol opgehaald uit bestand voor bot ${botId}`);
            return styling;
        }
        
        console.log(`Geen styling gevonden voor bot ${botId}`);
        return null;
    } catch (error) {
        console.error(`Fout bij ophalen bot styling voor ${botId}:`, error);
        return null;
    }
}

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

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    // Log de login poging (zonder wachtwoord)
    console.log(`[Auth] Login poging voor gebruiker: ${username}`);
    console.log(`[Auth] Environment variabelen: ADMIN_PASSWORD=${process.env.ADMIN_PASSWORD ? 'Aanwezig' : 'Ontbreekt'}, USER_PASSWORD=${process.env.USER_PASSWORD ? 'Aanwezig' : 'Ontbreekt'}`);
    
    // Controleer of de gebruikersnaam en wachtwoord zijn opgegeven
    if (!username || !password) {
        console.log(`[Auth] Login mislukt: Gebruikersnaam of wachtwoord ontbreekt`);
        return res.status(400).json({ 
            success: false, 
            message: 'Gebruikersnaam en wachtwoord zijn verplicht' 
        });
    }
    
    try {
        // Definieer de geldige gebruikers met de juiste wachtwoorden
        const validUsers = [
            { 
                username: 'admin', 
                password: 'Admin123!@#', // Hardcoded voor test doeleinden
                name: 'Admin Gebruiker', 
                role: 'admin' 
            },
            { 
                username: 'user', 
                password: 'User123!@#', // Hardcoded voor test doeleinden
                name: 'Normale Gebruiker', 
                role: 'user' 
            }
        ];
        
        // Debug informatie
        console.log(`[Auth] Valid users: ${JSON.stringify(validUsers.map(u => ({ username: u.username, password: u.password ? 'Aanwezig' : 'Ontbreekt' })))}`);
        
        // Zoek de gebruiker
        const user = validUsers.find(u => u.username === username);
        
        // Debug informatie
        console.log(`[Auth] Gevonden gebruiker: ${user ? 'Ja' : 'Nee'}`);
        if (user) {
            console.log(`[Auth] Wachtwoord controle: ${user.password === password ? 'Correct' : 'Incorrect'}`);
        }
        
        // Controleer of de gebruiker bestaat en het wachtwoord correct is
        if (!user || user.password !== password) {
            console.log(`[Auth] Login mislukt: Ongeldige inloggegevens voor gebruiker: ${username}`);
            return res.status(401).json({ 
                success: false, 
                message: 'Ongeldige gebruikersnaam of wachtwoord' 
            });
        }
        
        // Maak een sessie aan
        req.session.gebruiker = {
            username: user.username,
            naam: user.name,
            rol: user.role
        };
        
        // Maak een JWT token
        const tokenData = {
            username: user.username,
            naam: user.name,
            rol: user.role,
            exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 dagen geldig
        };
        
        const token = Buffer.from(JSON.stringify(tokenData)).toString('base64');
        
        // Stuur de token en gebruikersgegevens terug
        console.log(`[Auth] Login succesvol voor gebruiker: ${username}`);
        return res.json({
            success: true,
            token,
            user: {
                username: user.username,
                naam: user.name,
                rol: user.role
            }
        });
    } catch (error) {
        console.error('[Auth] Login error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Er is een fout opgetreden bij het inloggen' 
        });
    }
});

app.post('/api/auth/logout', (req, res) => {
    console.log('Logout request ontvangen');
    
    // Verwijder de sessie
    if (req.session) {
    req.session.destroy((err) => {
        if (err) {
                console.error('Fout bij vernietigen sessie:', err);
                return res.status(500).json({ error: 'Kon sessie niet vernietigen' });
            }
            console.log('Sessie succesvol vernietigd');
        });
    }
    
    // Verwijder auth cookies
    res.clearCookie('botpress-app.sid');
    res.clearCookie('bp-auth-token');
    res.clearCookie('auth-token');
    
    console.log('Logout succesvol afgerond');
    res.json({ success: true, message: 'Succesvol uitgelogd' });
});

app.get('/api/auth/check', (req, res) => {
    // Check sessie eerst
    if (req.session && req.session.gebruiker) {
        console.log('Gebruiker gevonden in sessie');
        return res.json({
            isAuthenticated: true, 
            gebruiker: req.session.gebruiker 
        });
    }
    
    // Check voor de auth token cookie
    const authCookie = req.cookies && req.cookies['bp-auth-token'];
    if (authCookie === 'admin-auth-token') {
        console.log('Gebruiker geautoriseerd via auth cookie');
        return res.json({
            isAuthenticated: true,
            gebruiker: {
                username: 'admin',
                naam: 'Admin Gebruiker',
                rol: 'admin'
            }
        });
    }
    
    // Check voor Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.substring(7); // Verwijder 'Bearer ' prefix
            const decodedData = JSON.parse(Buffer.from(token, 'base64').toString());
            
            // Check of de token niet verlopen is
            if (decodedData && decodedData.exp && decodedData.exp > Date.now()) {
                console.log('Gebruiker geautoriseerd via JWT token');
                return res.json({
                    isAuthenticated: true,
                    gebruiker: {
                        username: decodedData.username,
                        naam: decodedData.naam,
                        rol: decodedData.rol
                    }
                });
            }
        } catch (e) {
            console.error('Fout bij verwerken token:', e);
        }
    }
    
    // Geen geldige authenticatie gevonden
    res.json({ isAuthenticated: false });
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

// Voeg de feedback endpoints toe
app.post('/api/feedback', async (req, res) => {
    try {
        const { botId, userId, conversationId, rating, comment, name } = req.body;
        
        const query = `INSERT INTO feedback (bot_id, user_id, conversation_id, rating, comment, name) 
                      VALUES (?, ?, ?, ?, ?, ?)`;
        await supabase.from('feedback').insert({ bot_id: botId, user_id: userId, conversation_id: conversationId, rating: rating, comment: comment, name: name || null });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Fout bij opslaan feedback:', error);
        res.status(500).json({ error: 'Kon feedback niet opslaan' });
    }
});

// Endpoint om feedback op te halen (alleen voor admins)
app.get('/api/bots/:botId/feedback', checkAuth, async (req, res) => {
    try {
        const { botId } = req.params;
        console.log(`Ophalen feedback voor bot ${botId}...`);
        
        // Voeg debug logging toe voor Supabase client
        console.log('Supabase client status:', !!supabase);
        console.log('Supabase URL:', process.env.SUPABASE_URL);
        
        const { data, error } = await supabase
            .from('feedback')
            .select('*')
            .eq('bot_id', botId)
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error('Supabase error bij ophalen feedback:', error);
            return res.status(500).json({ 
                error: 'Kon feedback niet ophalen',
                details: error.message,
                code: error.code
            });
        }
        
        // Log de opgehaalde data voor debugging
        console.log(`Opgehaalde feedback data:`, data);
        
        // Zorg dat we altijd een array teruggeven
        const feedbackArray = Array.isArray(data) ? data : [];
        console.log(`${feedbackArray.length} feedback items opgehaald`);
        
        res.json(feedbackArray);
    } catch (error) {
        console.error('Onverwachte fout bij ophalen feedback:', error);
        res.status(500).json({ 
            error: 'Kon feedback niet ophalen',
            details: error.message
        });
    }
});

// Endpoint om feedback te downloaden als CSV (alleen voor admins)
app.get('/api/bots/:botId/feedback/download', checkAuth, async (req, res) => {
    try {
        const { botId } = req.params;
        const query = `SELECT * FROM feedback WHERE bot_id = ? ORDER BY timestamp DESC`;
        const feedback = await supabase.from('feedback').select().eq('bot_id', botId).order('timestamp', { ascending: false });
        
        // Converteer naar CSV
        const csvHeader = ['Datum', 'Naam', 'Rating', 'Opmerking', 'Conversatie ID'];
        const csvRows = feedback.map(f => [
            new Date(f.timestamp).toLocaleString(),
            f.name || 'Anoniem',
            f.rating,
            f.comment || '',
            f.conversation_id
        ]);
        
        const csv = [csvHeader, ...csvRows].map(row => row.join(',')).join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=feedback-${botId}-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Fout bij downloaden feedback:', error);
        res.status(500).json({ error: 'Kon feedback niet downloaden' });
    }
});

// Google Apps Script URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwp0G8MJ3jiJ9GSIMYHgCdKA_I2P95dJ3byftZWzvK3WPa54wNxCeVJAwiEsLzft0u1/exec';

// Proxy endpoint voor feedback data
app.get('/api/feedback-proxy', async (req, res) => {
    try {
        const action = req.query.action || 'getFeedback';
        const botId = req.query.botId;
        
        if (!botId) {
            return res.status(400).json({ 
                error: 'Geen bot ID opgegeven',
                message: 'Bot ID is verplicht voor deze actie'
            });
        }
        
        console.log(`Fetching feedback data from Google Script with action: ${action} for bot: ${botId}`);
        
        // Voeg een timestamp toe om caching te voorkomen
        const url = `${GOOGLE_SCRIPT_URL}?action=${action}&botId=${botId}&t=${Date.now()}`;
        console.log(`Request URL: ${url}`);

        // Voeg extra fetch opties toe
        const fetchOptions = {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'Cache-Control': 'no-cache',
                'User-Agent': 'Node.js Server'
            },
            redirect: 'follow',
            timeout: 10000 // 10 seconden timeout
        };
        
        console.log('Fetch options:', JSON.stringify(fetchOptions, null, 2));
        
        const response = await fetch(url, fetchOptions);
        
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        // Haal de ruwe tekst op
        const rawText = await response.text();
        console.log('Raw response text (first 1000 chars):', rawText.substring(0, 1000));

        // Als de response leeg is of undefined, stuur een lege array
        if (!rawText || rawText.trim() === '') {
            console.log('Empty response received, returning empty array');
            return res.json([]);
        }

        // Verwijder eventuele HTML tags en ongeldige karakters
        const cleanText = rawText.replace(/<[^>]*>/g, '').trim();
        console.log('Cleaned text (first 1000 chars):', cleanText.substring(0, 1000));

        let parsedData;
        
        // Probeer eerst als JSON te parsen
        try {
            parsedData = JSON.parse(cleanText);
            console.log('Successfully parsed as JSON:', typeof parsedData, Array.isArray(parsedData));
            const feedbackArray = Array.isArray(parsedData) ? parsedData : [parsedData];
            console.log('Returning feedback array with', feedbackArray.length, 'items');
            return res.json(feedbackArray);
        } catch (parseError) {
            console.error('JSON parse error:', parseError.message);
            
            // Als JSON parsen faalt, probeer als CSV
            try {
                const rows = cleanText.split('\n').map(row => row.split('\t')); // Gebruik tab als scheidingsteken
                console.log('CSV parsing - number of rows:', rows.length);
                
                if (rows.length > 1) {
                    const headers = rows[0];
                    console.log('CSV headers:', headers);
                    
                    const feedbackArray = rows.slice(1).map(row => {
                        const feedback = {};
                        headers.forEach((header, index) => {
                            let value = row[index]?.trim() || '';
                            // Probeer de chat geschiedenis te parsen als JSON
                            if (header === 'Chat Geschiedenis' && value) {
                                try {
                                    value = JSON.parse(value);
                                } catch (e) {
                                    console.error('Fout bij parsen chat geschiedenis:', e);
                                    value = [];
                                }
                            }
                            // Converteer de header naam naar camelCase voor consistentie
                            const key = header.toLowerCase()
                                .replace(/[^a-z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
                            feedback[key] = value;
                        });
                        return feedback;
                    });
                    
                    console.log('Successfully parsed as CSV, returning', feedbackArray.length, 'items');
                    return res.json(feedbackArray);
                }
            } catch (csvError) {
                console.error('CSV parse error:', csvError.message);
            }
        }

        // Als alles faalt, stuur debug informatie terug
        return res.status(500).json({
            error: 'Kon data niet verwerken',
            rawResponse: rawText.substring(0, 1000), // Eerste 1000 karakters
            cleanedResponse: cleanText.substring(0, 1000), // Eerste 1000 karakters
            responseStatus: response.status,
            responseHeaders: Object.fromEntries(response.headers.entries())
        });

    } catch (error) {
        console.error('Error in feedback proxy:', error);
        res.status(500).json({ 
            error: 'Kon feedback niet ophalen',
            details: error.message,
            stack: error.stack
        });
    }
});

// Download endpoint voor feedback CSV
app.get('/api/feedback-proxy/download', async (req, res) => {
    try {
        const botId = req.query.botId;
        
        if (!botId) {
            return res.status(400).json({ 
                error: 'Geen bot ID opgegeven',
                message: 'Bot ID is verplicht voor deze actie'
            });
        }
        
        const url = `${GOOGLE_SCRIPT_URL}?action=downloadCSV&botId=${botId}&t=${Date.now()}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const csvContent = await response.text();
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="feedback_${botId}_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);
        
    } catch (error) {
        console.error('Error downloading feedback:', error);
        res.status(500).json({ 
            error: 'Kon feedback niet downloaden',
            details: error.message
        });
    }
});

// Zorg ervoor dat de uploads directory bestaat
const UPLOADS_DIR = path.join(process.env.TEMP || os.tmpdir(), 'botpress-uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    try {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        console.log(`Uploads directory aangemaakt: ${UPLOADS_DIR}`);
    } catch (error) {
        console.error(`Kon uploads directory niet aanmaken: ${error.message}`);
    }
}

// Configureer multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        // Genereer unieke bestandsnaam
        const uniqueSuffix = crypto.randomBytes(8).toString('hex');
        const fileExt = path.extname(file.originalname);
        cb(null, `${Date.now()}-${uniqueSuffix}${fileExt}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB maximum bestandsgrootte
    },
    fileFilter: function (req, file, cb) {
        // Accepteer alleen afbeeldingen
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Alleen afbeeldingen zijn toegestaan!'), false);
        }
        cb(null, true);
    }
});

// API endpoint voor het uploaden van bestanden
app.post('/api/upload', checkAuth, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Geen bestand geüpload' });
        }
        
        console.log(`[${new Date().toISOString()}] Bestand geüpload: ${req.file.filename}`);
        
        // Stuur URL naar het geüploade bestand terug
        const fileUrl = `/temp-uploads/${req.file.filename}`;
        
        res.json({
            success: true,
            url: fileUrl,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size
        });
    } catch (error) {
        console.error('Fout bij uploaden bestand:', error);
        res.status(500).json({ error: 'Er is een fout opgetreden bij het uploaden van het bestand' });
    }
});

// Voeg een route toe voor bestanden in de uploads directory
app.use('/temp-uploads', express.static(UPLOADS_DIR));

// Voeg een route handler toe voor het ontbrekende welcome-bot.svg bestand
app.get('/img/welcome-bot.svg', (req, res) => {
    // Stuur een eenvoudige SVG terug
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(`
        <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#2C6BED" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
            <line x1="9" y1="9" x2="9.01" y2="9"></line>
            <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
    `);
});

// Start de server
app.listen(PORT, () => {
    console.log(`Server draait op http://localhost:${PORT}`);
});