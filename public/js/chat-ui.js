/**
 * Chat UI Module
 * 
 * Dit bestand bevat alle UI-gerelateerde functionaliteit voor de chat interface.
 */

// Beheer van polling interval
let pollingInterval = null;

/**
 * Start het pollen voor nieuwe berichten
 * @param {Object} client - De BotpressChatClient instance
 * @param {string} userId - Gebruikers ID
 * @param {string} userKey - Gebruikers key
 * @param {string} conversationId - Conversatie ID
 * @param {Set} lastProcessedMessageIds - Set van IDs van reeds verwerkte berichten
 * @param {Element} chatMessages - Element waar berichten moeten worden toegevoegd
 * @param {Element} consoleOutput - Element waar logs naartoe geschreven worden
 */
function startPollingMessages(client, userId, userKey, conversationId, lastProcessedMessageIds = new Set(), chatMessages, consoleOutput) {
    if (pollingInterval) clearInterval(pollingInterval);
    
    logToConsole('Start polling voor berichten...', 'info', consoleOutput);
    
    // Verkort de polling interval van 2000ms naar 1000ms voor snellere reacties
    pollingInterval = setInterval(async () => {
        try {
            // Controleer of conversationId is gedefinieerd
            if (!conversationId) {
                logToConsole('Geen conversationId beschikbaar voor polling berichten', 'error', consoleOutput);
                return;
            }
            
            // Haal berichten op
            let messages = await client.listMessages({
                userId,
                userKey,
                conversationId
            });
            
            // Alleen loggen als er berichten zijn
            if (messages.length > 0) {
                logToConsole(`${messages.length} berichten opgehaald`, 'info', consoleOutput);
                
                // Sorteer berichten op datum, nieuwste laatst (alleen indien nodig)
                if (messages.length > 1) {
                    messages.sort((a, b) => {
                        const dateA = a.created_at ? new Date(a.created_at) : new Date();
                        const dateB = b.created_at ? new Date(b.created_at) : new Date();
                        return dateA - dateB;
                    });
                }
                
                // Optimalisatie: Verwerk berichten in bulk indien mogelijk
                const newBotMessages = messages.filter(msg => {
                    // Als we dit bericht al hebben verwerkt, negeren
                    if (lastProcessedMessageIds.has(msg.id)) {
                        return false;
                    }
                    
                    // Voeg toe aan verwerkte berichten
                    lastProcessedMessageIds.add(msg.id);
                    
                    // Bepaal of het een bot bericht is (niet van de gebruiker)
                    return msg.direction === 'incoming' || 
                           msg.userId !== userId ||
                           (msg.payload && msg.payload.type === 'bot');
                });
                
                // Alleen verwerken als we echt nieuwe berichten hebben
                if (newBotMessages.length > 0) {
                    // Verberg typing indicator
                    const typingIndicator = document.getElementById('typing-indicator');
                    if (typingIndicator) {
                        showTyping(false, typingIndicator);
                    }
                    
                    // Efficiënter: Batch-verwerking van berichten
                    newBotMessages.forEach(msg => {
                        const messageText = msg.payload?.text || '(Geen tekst)';
                        logToConsole(`Bot: ${messageText}`, 'info', consoleOutput);
                        addMessage(messageText, false, chatMessages);
                    });
                }
            }
            
        } catch (error) {
            if (error.message.includes('ERR_INTERNET_DISCONNECTED')) {
                logToConsole('Netwerkfout bij ophalen berichten: Controleer je internetverbinding', 'error', consoleOutput);
            } else {
                logToConsole(`Fout bij ophalen berichten: ${error.message}`, 'error', consoleOutput);
            }
        }
    }, 1000); // Verkort van 2000ms naar 1000ms
    
    return pollingInterval;
}

/**
 * Stop het pollen voor nieuwe berichten
 */
function stopPollingMessages() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        logToConsole('Polling voor berichten gestopt', 'info');
    }
}

/**
 * Geavanceerde console logging
 * @param {string} message - Het bericht om te loggen
 * @param {string} type - Type van het bericht (info, error, success)
 * @param {Element} consoleOutput - Element waar logs naartoe geschreven worden
 */
function logToConsole(message, type = 'info', consoleOutput) {
    // Minder verbose logging in console voor betere prestaties
    if (type === 'error' || type === 'success') {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
    
    if (consoleOutput) {
        const p = document.createElement('p');
        p.className = type;
        p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        consoleOutput.appendChild(p);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
}

/**
 * Status bericht tonen
 * @param {string} message - Het status bericht om te tonen
 * @param {string} type - Type van het bericht (info, error, success)
 * @param {Element} statusElement - Element waar status moet worden getoond
 */
function showStatus(message, type, statusElement) {
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
    }
    logToConsole(message, type);
}

/**
 * Bericht toevoegen aan chat - geoptimaliseerde versie met Markdown ondersteuning
 * @param {string} message - Het bericht om toe te voegen
 * @param {boolean} isUser - Of het een gebruikersbericht is (true) of een bot bericht (false)
 * @param {Element} chatMessages - Element waar berichten moeten worden toegevoegd
 */
function addMessage(message, isUser = false, chatMessages) {
    if (!chatMessages) {
        console.error('Geen chatMessages element beschikbaar voor het toevoegen van berichten');
        return;
    }
    
    // Minder verbose logging
    if (isUser) {
        console.log(`Gebruikersbericht: "${message.substring(0, 30)}${message.length > 30 ? '...' : ''}"`);
    }
    
    // Verberg de welkomstafbeelding bij het eerste bericht
    const welcomeContainer = document.getElementById('welcomeImageContainer');
    if (welcomeContainer) {
        welcomeContainer.classList.add('hidden');
    }
    
    // Gebruik de DocumentFragment API voor betere rendering prestaties
    const fragment = document.createDocumentFragment();
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isUser ? 'user' : 'bot'}`;
    
    // Gebruik Markdown parsing voor bot berichten
    if (!isUser && window.marked) {
        // Configureer Marked voor veiligheid en prestaties
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false,
            sanitize: false,
        });

        // Parse markdown naar HTML
        let htmlContent = marked.parse(message);
        
        // Voeg target="_blank" toe aan alle links
        htmlContent = htmlContent.replace(/<a href="/g, '<a target="_blank" href="');
        
        // Sanitize HTML met DOMPurify als beschikbaar
        if (window.DOMPurify) {
            const cleanHtml = DOMPurify.sanitize(htmlContent, {
                ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote'],
                ALLOWED_ATTR: ['href', 'target']
            });
            messageElement.innerHTML = cleanHtml;
        } else {
            messageElement.innerHTML = htmlContent;
        }
    } else {
        // Gebruik eenvoudige text voor gebruikersberichten
        messageElement.textContent = message;
    }
    
    fragment.appendChild(messageElement);
    
    // Voeg toe aan de chat container
    const typingIndicator = chatMessages.querySelector('.typing-indicator');
    if (typingIndicator) {
        chatMessages.insertBefore(fragment, typingIndicator);
    } else {
        chatMessages.appendChild(fragment);
    }
    
    // Scroll naar beneden na een korte vertraging voor betere animatie
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 10);
}

/**
 * Typing indicator tonen/verbergen
 * @param {boolean} visible - Of de indicator zichtbaar moet zijn
 * @param {Element} typingIndicator - Het typing indicator element
 */
function showTyping(visible, typingIndicator) {
    if (typingIndicator) {
        if (visible) {
            typingIndicator.classList.add('visible');
        } else {
            typingIndicator.classList.remove('visible');
        }
    }
}

// Exporteer de functies
export {
    startPollingMessages,
    stopPollingMessages,
    logToConsole,
    showStatus,
    addMessage,
    showTyping
}; 