/**
 * Chat UI functies
 * Bevat alle functies voor het updaten van de UI
 */

/**
 * Voeg bericht toe aan UI
 */
function addMessageToUI(text, sender) {
    const messagesContainer = document.getElementById('chat-messages');
    const welcomeImage = document.getElementById('welcome-image');
    
    // Verberg welkomstafbeelding bij gebruikersberichten
    if (welcomeImage) {
        welcomeImage.classList.add('hidden');
    }
    
    // Maak berichtelement
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    
    // Verwerk markdown en sanitize
    if (sender === 'bot') {
        // Verwerk eerst ruwe HTML links in het bericht
        let fixedText = text;
        
        // Verwijder codeblok notatie rondom links
        fixedText = fixedText.replace(/```\s*(<a href=[^>]+>[^<]+<\/a>)\s*```/g, '$1');
        
        // Detecteer HTML link code die als platte tekst wordt weergegeven (verbeterde versie)
        const htmlLinkPattern = /<a href=(?:"|'|)(?:\{)?["']?(https?:\/\/[^"'\s\}]+)["']?(?:\})?(?:"|'|)(?:\s+target=(?:"|'|)(?:\{)?["']?_blank["']?(?:\})?(?:"|'|))?(?:\s+rel=(?:"|'|)(?:\{)?["']?noopener noreferrer["']?(?:\})?(?:"|'|))?>(.*?)<\/a>/g;
        
        // Vervang met correct geformatteerde HTML link
        fixedText = fixedText.replace(htmlLinkPattern, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>');
        
        // Fix JSON-achtige syntax in links
        fixedText = fixedText.replace(/<a href=\{([^}]+)\}/g, '<a href="$1"');
        
        // Parse markdown in HTML
        const sanitizedHtml = DOMPurify.sanitize(marked.parse(fixedText), {
            ADD_ATTR: ['target', 'rel']
        });
        
        // Zorg ervoor dat alle links target="_blank" hebben
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = sanitizedHtml;
        
        // Alle links in de content target="_blank" geven
        const links = tempDiv.querySelectorAll('a');
        links.forEach(link => {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        });
        
        messageDiv.innerHTML = tempDiv.innerHTML;
    } else {
        messageDiv.textContent = text;
    }
    
    // Voeg toe aan container
    messagesContainer.appendChild(messageDiv);
    
    // Scroll naar het laatste bericht
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Toon een melding aan de gebruiker
 */
function showNotification(message) {
    // Controleer of er al een notificatie element is
    let notification = document.getElementById('chat-notification');
    
    if (!notification) {
        // Maak een nieuw notificatie element
        notification = document.createElement('div');
        notification.id = 'chat-notification';
        notification.className = 'chat-notification';
        document.querySelector('.chat-main').appendChild(notification);
        
        // Voeg stijl toe voor notificaties als die nog niet bestaat
        if (!document.getElementById('notification-style')) {
            const style = document.createElement('style');
            style.id = 'notification-style';
            style.textContent = `
                .chat-notification {
                    position: fixed;
                    top: 60px;
                    left: 50%;
                    transform: translateX(-50%);
                    background-color: rgba(0, 0, 0, 0.7);
                    color: white;
                    padding: 10px 15px;
                    border-radius: 20px;
                    z-index: 1000;
                    font-size: 14px;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                .chat-notification.visible {
                    opacity: 1;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Toon de notificatie
    notification.textContent = message;
    notification.classList.add('visible');
    
    // Verberg na 3 seconden
    setTimeout(() => {
        notification.classList.remove('visible');
    }, 3000);
}

/**
 * Functie om de chat interface te resetten na een antwoord
 */
function resetChatInterface() {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-btn');
    const suggestionButtons = document.querySelectorAll('.suggestion-button');
    
    // Herstel invoerveld en verzendknop
    messageInput.disabled = false;
    messageInput.placeholder = "Typ hier je bericht...";
    messageInput.classList.remove('input-waiting');
    sendButton.disabled = false;
    sendButton.classList.remove('disabled');
    
    // Herstel suggestieknoppen
    suggestionButtons.forEach(button => {
        button.disabled = false;
        button.classList.remove('disabled');
    });
    
    // Reset wachtstatus
    isWaitingForResponse = false;
}

/**
 * Toon typing indicator
 */
function showTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    
    if (indicator) {
        indicator.classList.add('visible');
        
        // Scroll naar beneden
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

/**
 * Verberg typing indicator
 */
function hideTypingIndicator() {
    const typingIndicator = document.querySelector('.typing-indicator');
    if (typingIndicator) {
        typingIndicator.classList.remove('visible');
    }
}

/**
 * Controleer of typing indicator nog getoond moet worden
 */
function checkTypingIndicator() {
    // Als we na 500ms nog geen antwoord hebben, verberg de indicator
    // Dit zorgt ervoor dat de indicator niet oneindig blijft staan bij een fout
    const lastMessage = document.querySelector('.message:last-child');
    if (lastMessage && lastMessage.classList.contains('user')) {
        // Als het laatste bericht van de gebruiker is, toon typing indicator
        showTypingIndicator();
    } else {
        // Anders verberg de indicator
        hideTypingIndicator();
    }
}

/**
 * Functie om de loading overlay te verbergen
 */
function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 500);
    }
}

/**
 * Voeg stijlen toe voor de reset-knop in berichten
 */
function addResetButtonStyles() {
    // Controleer of de stijlen al bestaan
    if (document.querySelector('style[data-reset-button="true"]')) {
        return;
    }
    
    const resetButtonStyle = document.createElement('style');
    resetButtonStyle.setAttribute('data-reset-button', 'true');
    resetButtonStyle.textContent = `
        .message-reset-container {
            display: flex;
            justify-content: center;
            margin: 15px 0;
            padding: 5px;
        }
        
        .message-reset-button {
            background-color: var(--primary-color, #007bff);
            color: white;
            border: none;
            border-radius: 20px;
            padding: 8px 15px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .message-reset-button:hover {
            opacity: 0.9;
            transform: scale(1.05);
        }
    `;
    
    document.head.appendChild(resetButtonStyle);
} 