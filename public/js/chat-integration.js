/**
 * Chat Integratie JS
 * 
 * Dit bestand bevat de chatfunctionaliteit voor chat.html,
 * gebruikmakend van de gemodulariseerde Botpress API en Supabase integratie.
 */

import { BotpressChatClient, extractWebhookId } from './botpress-api.js';
import { startPollingMessages, stopPollingMessages, logToConsole, showStatus, addMessage, showTyping } from './chat-ui.js';
import { getBotById, getBotStyling, saveChatMessage } from './supabase-service.js';

// Globale variabelen
let userId = null;
let userKey = null;
let conversationId = null;
let webhookId = null;
let client = null;
let botId = null;
let lastProcessedMessageIds = [];
let isPolling = false;
let displayedMessageIds = new Set();

// DOM elementen
const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const resetButton = document.getElementById('reset-chat');
const typingIndicator = document.querySelector('.typing-indicator');

// Event listeners toevoegen
document.addEventListener('DOMContentLoaded', () => {
    if (sendButton) {
        sendButton.addEventListener('click', handleSendMessage);
    }
    
    if (userInput) {
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSendMessage();
            }
        });
    }
    
    if (resetButton) {
        resetButton.addEventListener('click', resetChat);
    }
    
    // Initialiseer de chat
    initializeChat();
});

/**
 * Functie om een error message toe te voegen
 */
function showError(message) {
    if (!messagesContainer) return;
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    messagesContainer.appendChild(errorDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    console.error(message);
}

/**
 * Zet de typing indicator aan/uit
 */
function setTypingIndicator(visible) {
    if (typingIndicator) {
        if (visible) {
            typingIndicator.classList.add('active');
        } else {
            typingIndicator.classList.remove('active');
        }
    }
}

/**
 * Verwerk het versturen van een bericht (geoptimaliseerde versie)
 */
async function handleSendMessage() {
    // Snelle check
    if (!userInput) return;
    
    const text = userInput.value.trim();
    if (!text) return;
    
    // UI update eerst voor betere gebruikerservaring
    userInput.value = '';
    userInput.focus();
    
    try {
        // Voeg direct het bericht toe aan de UI
        addMarkdownMessage(text, true);
        
        // Toon typing indicator direct
        setTypingIndicator(true);
        
        // Verstuur het bericht asynchroon
        const messageResult = await client.sendMessage({
            userId,
            userKey,
            conversationId,
            payload: {
                type: 'text',
                text
            }
        });
        
        // Voeg het bericht ID toe aan de lijst met verwerkte berichten
        if (messageResult && messageResult.id) {
            displayedMessageIds.add(messageResult.id);
        }
    } catch (error) {
        console.error('Fout bij versturen bericht:', error);
        setTypingIndicator(false);
        // Toon een foutmelding aan de gebruiker
        addMarkdownMessage('Er is een fout opgetreden bij het versturen van je bericht. Probeer het opnieuw.', false);
    }
}

/**
 * Verstuur een gebruikersbericht naar de Botpress API
 */
async function sendUserMessage(text) {
    if (!text || !userId || !conversationId || !userKey || !webhookId) {
        showError('Niet alle benodigde gegevens zijn beschikbaar om het bericht te versturen');
        return;
    }

    try {
        // Voeg bericht toe aan chat
        addMarkdownMessage(text, true);
        
        // Sla bericht op in Supabase als botId beschikbaar is
        if (botId) {
            saveChatMessage(botId, userId, conversationId, text, true)
                .catch(error => console.error('Fout bij opslaan chatbericht:', error));
        }
        
        // Toon typing indicator
        setTypingIndicator(true);
        
        // Verstuur bericht naar Botpress
        const messageResult = await client.sendMessage({
            userId,
            userKey,
            conversationId,
            payload: {
                type: 'text',
                text
            }
        });
        
        // Voeg het verstuurde bericht ID toe aan de displayedMessageIds
        displayedMessageIds.add(messageResult.id);
        
        console.log('Bericht verzonden met ID:', messageResult.id);
    } catch (error) {
        console.error('Fout bij versturen bericht:', error);
        setTypingIndicator(false);
        showError('Er is een fout opgetreden bij het versturen van uw bericht. Probeer het opnieuw.');
    }
}

/**
 * Voeg een bericht toe met Markdown ondersteuning (geoptimaliseerde versie)
 */
function addMarkdownMessage(text, isUser = false) {
    if (!messagesContainer) return;
    
    // Maak het berichtelement met DocumentFragment voor betere prestaties
    const fragment = document.createDocumentFragment();
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
    
    // Alleen markdown parsen voor bot-berichten (niet voor gebruikersberichten)
    if (!isUser) {
        // Configureer marked voor snelheid
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false,
            sanitize: false,
        });

        // Parse de Markdown naar HTML
        let htmlContent = marked.parse(text);

        // Voeg target="_blank" toe aan alle links
        htmlContent = htmlContent.replace(/<a href="/g, '<a target="_blank" href="');
        
        // Sanitize de HTML met DOMPurify (indien beschikbaar)
        if (window.DOMPurify) {
            const cleanHtml = DOMPurify.sanitize(htmlContent, {
                ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote'],
                ALLOWED_ATTR: ['href', 'target']
            });
            messageDiv.innerHTML = cleanHtml;
        } else {
            messageDiv.innerHTML = htmlContent;
        }
    } else {
        // Voor gebruikersberichten: eenvoudige tekstweergave zonder Markdown
        messageDiv.textContent = text;
    }
    
    // Voeg toe aan fragment en daarna aan DOM
    fragment.appendChild(messageDiv);
    messagesContainer.appendChild(fragment);
    
    // Scroll naar beneden (na een kleine vertraging voor betere animatie)
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 10);
}

/**
 * Haal berichten op en verwerk ze (geoptimaliseerde versie)
 */
async function fetchAndProcessMessages() {
    try {
        if (!client || !userId || !userKey || !conversationId) return;
        
        // Haal berichten op via onze client
        const messages = await client.listMessages({
            userId,
            userKey,
            conversationId
        });
        
        // Verwerk de berichten alleen als er berichten zijn
        if (messages && messages.length > 0) {
            // Sorteer berichten alleen als er meer dan 1 bericht is
            if (messages.length > 1) {
                messages.sort((a, b) => {
                    const dateA = a.created_at ? new Date(a.created_at) : new Date();
                    const dateB = b.created_at ? new Date(b.created_at) : new Date();
                    return dateA - dateB;
                });
            }
            
            // Collectie van nieuwe berichten die in één keer kunnen worden toegevoegd
            const newBotMessages = [];
            
            // Efficiëntere verwerking van berichten
            messages.forEach(message => {
                // Check of we dit bericht al hebben getoond
                if (!displayedMessageIds.has(message.id)) {
                    // Check of het een bot bericht is
                    const isBotMessage = message.direction === 'incoming' || 
                                       message.userId !== userId ||
                                       (message.payload && message.payload.type === 'bot');
                    
                    if (isBotMessage) {
                        // Voeg toe aan collectie van nieuwe berichten
                        newBotMessages.push({
                            id: message.id,
                            text: message.payload?.text || '(Geen tekst)'
                        });
                        
                        // Markeer als getoond
                        displayedMessageIds.add(message.id);
                    }
                }
            });
            
            // Als we nieuwe berichten hebben, verberg de typing indicator en toon de berichten
            if (newBotMessages.length > 0) {
                setTypingIndicator(false);
                
                // Voeg alle nieuwe berichten toe aan de UI
                newBotMessages.forEach(msg => {
                    addMarkdownMessage(msg.text, false);
                });
            }
        }
    } catch (error) {
        console.error('Fout bij ophalen berichten:', error);
    }
}

/**
 * Start periodiek ophalen van berichten (geoptimaliseerde versie)
 */
function startPolling() {
    if (isPolling) return;
    
    isPolling = true;
    console.log('Polling gestart');
    
    // Verkort polling interval van 2000ms naar 1000ms voor snellere reactietijd
    const pollInterval = setInterval(async () => {
        if (!isPolling) {
            clearInterval(pollInterval);
            return;
        }
        
        await fetchAndProcessMessages();
    }, 1000);
    
    // Geef het interval terug zodat we het later kunnen stoppen
    return pollInterval;
}

/**
 * Stop polling voor berichten
 */
function stopPolling() {
    isPolling = false;
    console.log('Polling gestopt');
}

/**
 * Reset de chat (start een nieuwe conversatie)
 */
async function resetChat() {
    if (!client || !userId || !userKey || !conversationId) return;
    
    try {
        // Stop polling
        stopPolling();
        
        console.log('Chat resetten...');
        
        // Verwijder de huidige conversatie
        await client.deleteConversation({
            userId,
            userKey,
            conversationId
        });
        
        console.log('Vorige conversatie verwijderd');
        
        // Wis berichten uit de UI
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        
        // Reset de tracked message IDs
        displayedMessageIds = new Set();
        
        // Maak een nieuwe conversatie aan
        const conversation = await client.createConversation({
            userId,
            userKey
        });
        
        conversationId = conversation.id;
        console.log(`Nieuwe conversatie aangemaakt: ${conversationId}`);
        
        // Start polling opnieuw
        startPolling();
        
        // Voeg welkomstbericht toe
        addMarkdownMessage('Hallo! Hoe kan ik je helpen?', false);
    } catch (error) {
        console.error('Fout bij herstarten chat:', error);
        showError('Er is een fout opgetreden bij het herstarten van de chat. Probeer het opnieuw.');
    }
}

/**
 * Initialiseer de chat
 */
async function initializeChat() {
    try {
        // Haal de bot ID uit de URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        botId = urlParams.get('bot');
        
        // Haal de webhook ID op uit localStorage of URL parameter
        const rawWebhookId = localStorage.getItem('currentWebhookId') || urlParams.get('webhook');
        webhookId = extractWebhookId(rawWebhookId);
        
        if (!webhookId) {
            showError('Geen webhook ID gevonden. Ga terug naar de configuratiepagina.');
            return;
        }
        
        console.log('Webhook ID:', webhookId);
        
        // Als bot ID is opgegeven, haal dan de bot gegevens op
        if (botId) {
            try {
                // Haal bot informatie op uit Supabase
                const bot = await getBotById(botId);
                if (bot) {
                    // Gebruik de webhook ID van de bot
                    webhookId = extractWebhookId(bot.webhook_id);
                    
                    // Update de titel van de pagina
                    document.title = `Chat met ${bot.name}`;
                    
                    // Update de bot naam in de UI als er een element voor is
                    const botNameElement = document.querySelector('.bot-name');
                    if (botNameElement) {
                        botNameElement.textContent = bot.name;
                    }
                    
                    // Haal styling op
                    const styling = await getBotStyling(botId);
                    if (styling) {
                        // Pas logo toe indien beschikbaar
                        if (styling.logo_url) {
                            const logoImg = document.querySelector('.bot-logo img');
                            if (logoImg) {
                                logoImg.src = styling.logo_url;
                            }
                        }
                        
                        // Pas welkomstafbeelding toe indien beschikbaar
                        if (styling.welcome_image_url) {
                            const welcomeImg = document.querySelector('.welcome-image-container img');
                            if (welcomeImg) {
                                welcomeImg.src = styling.welcome_image_url;
                                welcomeImg.parentElement.classList.remove('hidden');
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Fout bij ophalen bot gegevens:', error);
            }
        }
        
        // Maak een nieuwe client
        client = new BotpressChatClient({
            webhookId: webhookId
        });
        
        // Creëer een gebruiker
        const userResult = await client.createUser({
            name: `User-${Date.now()}`,
            tags: { source: 'web-client' }
        });
        
        userId = userResult.user.id;
        userKey = userResult.key;
        
        console.log('Gebruiker aangemaakt:', { userId, userKey });
        
        // Creëer een conversatie
        const conversation = await client.createConversation({
            userId,
            userKey
        });
        
        conversationId = conversation.id;
        console.log('Conversatie aangemaakt:', conversationId);
        
        // Start het pollen van berichten
        startPolling();
        
        // Voeg welkomstbericht toe
        addMarkdownMessage('Hallo! Hoe kan ik je helpen?', false);
        
        // Focus op de input
        if (userInput) {
            userInput.focus();
        }
    } catch (error) {
        console.error('Fout bij initialiseren chat:', error);
        showError(`Fout bij het initialiseren van de chat: ${error.message}`);
    }
} 