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

        // Verbeterde multiple choice regex - ondersteunt meerdere formaten
        // Reguliere multiple choice met genummerde of geletterde opties - veel specifieker formulering
        const multipleChoiceRegex = /(.+?)\s*\n\s*(?:(?:Kies uit|Opties|Keuzes|Selecteer|Je kunt kiezen uit|Maak een keuze|Kies één optie|Keuzemogelijkheden|Selecteer één van de volgende|Geef aan welke optie)(?:\s*een\s*van)?:?\s*)?(?:\n\s*)?([A-Za-z0-9][.)]\s*[^\n]+(?:\n\s*[A-Za-z0-9][.)]\s*[^\n]+)*)/i;
        
        // Lijst met opties/keuzen (zonder nummering of letters)
        const listChoiceRegex = /(.+?)\s*\n\s*(?:(?:Kies uit|Opties|Keuzes|Selecteer|Je kunt kiezen uit|Maak een keuze|Kies één optie|Keuzemogelijkheden|Selecteer één van de volgende|Geef aan welke optie)(?:\s*een\s*van)?:?\s*)?(?:\n\s*)?(?:[-*•]\s*[^\n]+(?:\n\s*[-*•]\s*[^\n]+)+)/i;
        
        // Regex voor individuele opties (zowel genummerd/geletterd als met streepjes)
        const choiceItemRegex = /\s*(?:([A-Za-z0-9][.)])|[-*•]|^\s*)\s*([^\n]+)/gm;
        
        // Controleer of het bericht woorden bevat die specifiek op een keuze duiden
        const containsChoiceKeyword = fixedText.match(/kies|opties|keuzes|selecteer|maak een keuze|geef aan/i);
        
        // Probeer eerst de genummerde/geletterde multiple choice optie
        let multipleChoiceMatch = containsChoiceKeyword ? fixedText.match(multipleChoiceRegex) : null;
        
        // Als dat niet werkt, probeer dan de lijst met streepjes
        if (!multipleChoiceMatch && containsChoiceKeyword) {
            multipleChoiceMatch = fixedText.match(listChoiceRegex);
        }
        
        if (multipleChoiceMatch && containsChoiceKeyword) {
            // Vraag gevonden met multiple choice opties
            const question = multipleChoiceMatch[1].trim();
            let optionsText = multipleChoiceMatch[2] || multipleChoiceMatch[0].split(/\n/).slice(1).join('\n');
            
            // Parse de opties uit de tekst
            const options = [];
            let match;
            
            // Reset de regex voor hergebruik
            choiceItemRegex.lastIndex = 0;
            
            while ((match = choiceItemRegex.exec(optionsText)) !== null) {
                if (match[2] && match[2].trim()) {
                    options.push(match[2].trim());
                }
            }
            
            // Als we opties hebben, maak een multiple choice interface
            if (options.length > 0) {
                // Maak een fragment voor betere performance
                const fragment = document.createDocumentFragment();
                
                // Voeg de vraag toe als normale tekst
                const questionElement = document.createElement('div');
                questionElement.className = 'bot-question';
                
                // Parse vraag markdown in HTML
                const sanitizedHtml = DOMPurify.sanitize(marked.parse(question), {
                    ADD_ATTR: ['target', 'rel']
                });
                
                questionElement.innerHTML = sanitizedHtml;
                fragment.appendChild(questionElement);
                
                // Voeg de choice container toe
                const choicesContainer = document.createElement('div');
                choicesContainer.className = 'multiple-choice-container';
                
                // Voeg elke optie toe als knop
                options.forEach(option => {
                    const button = document.createElement('button');
                    button.className = 'multiple-choice-button';
                    button.textContent = option;
                    button.onclick = function() {
                        if (!isWaitingForResponse) {
                            sendUserMessage(option);
                        } else {
                            showNotification("Even geduld, je vorige vraag wordt nog verwerkt...");
                        }
                    };
                    choicesContainer.appendChild(button);
                });
                
                fragment.appendChild(choicesContainer);
                
                // Voeg toe aan het berichten element
                messageDiv.appendChild(fragment);
                
                // Voeg CSS toe voor multiple choice buttons als deze nog niet bestaat
                if (!document.querySelector('style[data-multiple-choice="true"]')) {
                    const style = document.createElement('style');
                    style.setAttribute('data-multiple-choice', 'true');
                    style.textContent = `
                        .bot-question {
                            margin-bottom: 12px;
                        }
                        
                        .multiple-choice-container {
                            display: flex;
                            flex-direction: column;
                            gap: 8px;
                            margin-top: 8px;
                        }
                        
                        .multiple-choice-button {
                            background-color: var(--primary-color, #007bff);
                            color: white;
                            border: none;
                            border-radius: 8px;
                            padding: 8px 12px;
                            font-size: 14px;
                            text-align: left;
                            cursor: pointer;
                            transition: all 0.2s;
                        }
                        
                        .multiple-choice-button:hover {
                            opacity: 0.9;
                            transform: translateY(-2px);
                        }
                    `;
                    document.head.appendChild(style);
                }
                
                // Skip verdere verwerking omdat we de inhoud al hebben toegevoegd
                messagesContainer.appendChild(messageDiv);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                return;
            }
        }
        
        // Parse markdown in HTML als het geen multiple choice was of we konden de opties niet extraheren
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