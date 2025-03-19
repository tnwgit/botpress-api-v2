let userId = null;
let userKey = null;
let conversationId = null;
let webhookId = null;
let lastMessageId = null;
let isPolling = false;
let pollTimeout = null;
let displayedMessageIds = new Set();

// DOM elementen
const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

// Functie om een error message toe te voegen
function showError(message) {
    const messagesDiv = document.getElementById('messages');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    messagesDiv.appendChild(errorDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Functie om een bericht toe te voegen aan de chat
function addMessage(text, isUser = false) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    
    // Configureer marked voor veilige Markdown parsing
    marked.setOptions({
        breaks: true, // Sta regelafbreking toe met enkele newline
        gfm: true, // GitHub Flavored Markdown
        headerIds: false, // Geen header IDs (veiliger)
        mangle: false, // Geen email mangling
        sanitize: false, // We gebruiken DOMPurify voor sanitization
    });

    // Parse de Markdown naar HTML
    let htmlContent = marked.parse(text);

    // Voeg target="_blank" toe aan alle links
    htmlContent = htmlContent.replace(/<a href="/g, '<a target="_blank" href="');
    
    // Sanitize de HTML met DOMPurify
    const cleanHtml = DOMPurify.sanitize(htmlContent, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
        ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'title']
    });
    
    messageDiv.innerHTML = cleanHtml;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Functie om de typing indicator te tonen/verbergen
function setTypingIndicator(visible) {
    const indicator = document.querySelector('.typing-indicator');
    if (visible) {
        indicator.classList.add('active');
    } else {
        indicator.classList.remove('active');
    }
}

// Functie om berichten op te halen
async function fetchMessages() {
    try {
        const response = await fetch(`/api/messages/${conversationId}`, {
            headers: {
                'x-user-key': userKey,
                'x-webhook-id': webhookId
            }
        });
        
        if (!response.ok) {
            throw new Error('Fout bij het ophalen van berichten');
        }
        
        const messages = await response.json();
        
        // Verwerk nieuwe berichten
        messages.forEach(message => {
            // Check of we dit bericht al hebben getoond
            if (!displayedMessageIds.has(message.id)) {
                // Check of het een bot bericht is
                if (!message.userId || message.userId !== userId) {
                    console.log('Nieuw bot bericht toevoegen:', message);
                    setTypingIndicator(false);
                    addMessage(message.payload.text);
                    displayedMessageIds.add(message.id);
                }
            }
        });

        return messages;
    } catch (error) {
        console.error('Error fetching messages:', error);
        showError('Fout bij het ophalen van berichten');
        return [];
    }
}

// Functie om een bericht te versturen
async function sendMessage(text) {
    if (!text || !userId || !conversationId || !userKey || !webhookId) {
        showError('Niet alle benodigde gegevens zijn beschikbaar om het bericht te versturen');
        return;
    }

    try {
        console.log('Bericht versturen:', { text, userId, conversationId, webhookId });
        addMessage(text, true);
        setTypingIndicator(true);

        const response = await fetch('/api/message', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                userId, 
                userKey, 
                conversationId, 
                webhookId,
                text 
            })
        });
        
        if (!response.ok) {
            throw new Error('Fout bij versturen bericht');
        }

        const result = await response.json();
        console.log('Bericht verstuurd:', result);
        displayedMessageIds.add(result.id);
        
        // Start polling voor antwoord
        startPolling();
    } catch (error) {
        console.error('Error sending message:', error);
        showError('Er is een fout opgetreden bij het versturen van uw bericht. Probeer het opnieuw.');
        setTypingIndicator(false);
    }
}

// Functie om de webhook ID te extraheren uit de URL of pure ID
function extractWebhookId(input) {
    if (!input) return null;
    // Als het een URL is, haal dan de laatste deel van de URL
    if (input.includes('webhook.botpress.cloud')) {
        return input.split('/').pop();
    }
    return input;
}

// Functie om de chat te initialiseren
async function initializeChat() {
    try {
        // Haal de webhook ID op uit localStorage en extraheer de pure ID
        const rawWebhookId = localStorage.getItem('currentWebhookId');
        webhookId = extractWebhookId(rawWebhookId);
        
        if (!webhookId) {
            throw new Error('Geen webhook ID gevonden. Ga terug naar de configuratiepagina.');
        }

        console.log('Using webhook ID:', webhookId);

        // Maak een nieuwe gebruiker aan
        const userResponse = await fetch('/api/user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                webhookId
            })
        });
        
        if (!userResponse.ok) {
            throw new Error('Fout bij het aanmaken van een gebruiker');
        }
        
        const userData = await userResponse.json();
        userId = userData.user.id;
        userKey = userData.key;
        
        // Maak een nieuwe conversatie aan
        const convResponse = await fetch('/api/conversation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId,
                userKey,
                webhookId
            })
        });
        
        if (!convResponse.ok) {
            throw new Error('Fout bij het aanmaken van een conversatie');
        }
        
        const convData = await convResponse.json();
        conversationId = convData.id;
        
        // Start met het ophalen van berichten
        startPolling();
    } catch (error) {
        console.error('Error initializing chat:', error);
        showError(error.message);
    }
}

// Start polling
function startPolling() {
    if (!isPolling) {
        console.log('Polling gestart');
        isPolling = true;
        pollMessages();
    }
}

// Stop polling
function stopPolling() {
    if (isPolling) {
        console.log('Polling gestopt');
        isPolling = false;
        if (pollTimeout) {
            clearTimeout(pollTimeout);
            pollTimeout = null;
        }
    }
}

// Poll berichten
async function pollMessages() {
    if (!isPolling) return;
    
    try {
        await fetchMessages();
        
        // Ga door met pollen
        if (isPolling) {
            pollTimeout = setTimeout(pollMessages, 1000);
        }
    } catch (error) {
        console.error('Error in message polling:', error);
        if (isPolling) {
            pollTimeout = setTimeout(pollMessages, 1000);
        }
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initializeChat();
    
    const input = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    
    async function handleSendMessage() {
        const text = input.value.trim();
        if (text) {
            input.value = '';
            await sendMessage(text);
        }
    }
    
    sendButton.addEventListener('click', handleSendMessage);
    
    input.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSendMessage();
        }
    });
}); 