/**
 * Chat main functionaliteit
 * Bevat de hoofdlogica voor de chat client
 */

// Poll voor nieuwe berichten
let isPolling = false;
let pollingInterval;
let lastProcessedMessageIds = [];

/**
 * Stuur een gebruikersbericht
 */
async function sendUserMessage(text) {
    try {
        // Debounce mechanisme - voorkom te snel versturen van berichten
        const now = Date.now();
        if (now - lastMessageTime < MESSAGE_COOLDOWN) {
            showNotification("Je typt te snel! Even rustig aan...");
            return;
        }
        
        // Als we al wachten op een antwoord, blokkeer nieuwe berichten
        if (isWaitingForResponse) {
            // Blokkeer nieuwe berichten zonder melding te tonen
            return;
        }
        
        // Update laatste berichttijd
        lastMessageTime = now;
        
        // Markeer dat we wachten op een antwoord
        isWaitingForResponse = true;
        
        // Schakel invoerveld en verzendknop uit
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-btn');
        const suggestionButtons = document.querySelectorAll('.suggestion-button');
        
        // Maak invoerveld direct leeg
        messageInput.value = '';
        messageInput.style.height = '40px';
        
        messageInput.disabled = true;
        messageInput.placeholder = "Even geduld, de assistent denkt na...";
        messageInput.classList.add('input-waiting');
        sendButton.disabled = true;
        sendButton.classList.add('disabled');
        
        // Schakel ook alle suggestieknoppen uit
        suggestionButtons.forEach(button => {
            button.disabled = true;
            button.classList.add('disabled');
        });
        
        // Haal gegevens op uit localStorage
        const webhookId = localStorage.getItem('currentWebhookId');
        const botId = localStorage.getItem('botId');
        let userId = localStorage.getItem('userId');
        let userKey = localStorage.getItem('userKey');
        let conversationId = localStorage.getItem('conversationId');
        
        if (!webhookId || !botId) {
            throw new Error('Geen geldige bot gegevens beschikbaar');
        }
        
        // Voeg bericht toe aan UI
        addMessageToUI(text, 'user');
    
        // Toon typing indicator
        showTypingIndicator();
        
        // Als we nog geen gebruiker of conversatie hebben, maak deze aan
        if (!userId || !userKey || !conversationId) {
            console.log('Geen gebruiker of conversatie gevonden, initialiseren...');
            await initializeChat();
            
            // Haal gegevens opnieuw op na initialisatie
            userId = localStorage.getItem('userId');
            userKey = localStorage.getItem('userKey');
            conversationId = localStorage.getItem('conversationId');
            
            console.log('Chat initialisatie voltooid. UserId:', userId, 'UserKey:', userKey, 'ConversationId:', conversationId);
            
            // Controleer of we nu wel een geldige conversatie hebben
            if (!conversationId) {
                throw new Error('Kon geen geldige conversatie aanmaken');
            }
        }
        
        // Creëer client voor deze aanvraag
        const client = new BotpressChatClient({
            webhookId: extractWebhookId(webhookId.trim())
        });
        
        // Log de gegevens waarmee we het bericht gaan versturen
        console.log('Bericht versturen met gegevens - UserId:', userId, 'ConversationId:', conversationId);
        
        // Stuur bericht direct via de client
        const messageResult = await client.sendMessage({
            userId,
            userKey,
            conversationId,
            payload: {
                type: 'text',
                text
            }
        });
        
        console.log('Bericht verstuurd, resultaat:', messageResult);
        
        // Controleer na 500ms of de typing indicator nog getoond moet worden
        setTimeout(checkTypingIndicator, 500);
        
        // Wacht op antwoord via polling
        pollForMessages();
        
    } catch (error) {
        console.error('Fout bij versturen bericht:', error);
        hideTypingIndicator();
        addMessageToUI('Er is een fout opgetreden bij het versturen van je bericht. Probeer het opnieuw.', 'bot');
        
        // Herstel interface ook bij fouten
        resetChatInterface();
    }
}

/**
 * Initialiseer chat
 */
async function initializeChat() {
    try {
        // Haal gegevens op uit localStorage
        const webhookId = localStorage.getItem('currentWebhookId');
        const botId = localStorage.getItem('botId');
        
        if (!webhookId || !botId) {
            throw new Error('Geen geldige bot gegevens beschikbaar');
        }
        
        console.log('Initialiseren chat met webhook ID:', webhookId);
        
        // Creëer een Botpress client
        const client = new BotpressChatClient({
            webhookId: extractWebhookId(webhookId.trim())
        });
        
        // Maak een nieuwe gebruiker
        const userResult = await client.createUser({
            name: `User-${Date.now()}`,
            tags: { source: 'web-client' }
        });
        
        const userId = userResult.user.id;
        const userKey = userResult.key;
        
        console.log('Gebruiker aangemaakt:', userId, userKey);
        
        // Sla gebruikersgegevens op
        localStorage.setItem('userId', userId);
        localStorage.setItem('userKey', userKey);
        
        // Maak een conversatie aan direct met de client
        try {
            const conversation = await client.createConversation({
                userId,
                userKey
            });
            
            // Controleer of we een geldig conversatie object hebben ontvangen
            console.log('Conversatie resultaat:', conversation);
            
            let conversationId;
            
            // Haal conversatie ID op afhankelijk van het antwoordformaat
            if (conversation.id) {
                conversationId = conversation.id;
                console.log('Conversatie ID direct gevonden:', conversationId);
            } else if (conversation.conversation && conversation.conversation.id) {
                conversationId = conversation.conversation.id;
                console.log('Conversatie ID in genest object gevonden:', conversationId);
            } else {
                console.error('Kon geen conversatie ID vinden in antwoord:', conversation);
                throw new Error('Ongeldig antwoordformaat: geen conversatie ID gevonden');
            }
            
            // Sla conversatie ID op
            localStorage.setItem('conversationId', conversationId);
            console.log('Conversatie aangemaakt en opgeslagen:', conversationId);
        } catch (convError) {
            console.error('Fout bij aanmaken conversatie:', convError);
            throw new Error(`Kon geen conversatie aanmaken: ${convError.message}`);
        }
        
        // Verberg error container als alles succesvol is
        document.getElementById('error-container').style.display = 'none';
        
    } catch (error) {
        console.error('Fout bij initialiseren chat:', error);
        document.getElementById('error-container').style.display = 'block';
        document.getElementById('error-container').textContent = 
            `Er is een fout opgetreden bij het initialiseren van de chat: ${error.message}\n\nProbeer de pagina te vernieuwen.`;
    }
}

/**
 * Reset chat
 */
async function resetChat() {
    try {
        // Haal gegevens op uit localStorage
        const userId = localStorage.getItem('userId');
        const userKey = localStorage.getItem('userKey');
        const conversationId = localStorage.getItem('conversationId');
        const webhookId = localStorage.getItem('currentWebhookId');
        
        if (!userId || !userKey || !conversationId || !webhookId) {
            throw new Error('Geen geldige chat gegevens beschikbaar');
        }
        
        // Wis chat geschiedenis
        document.getElementById('chat-messages').innerHTML = `
            <div class="welcome-image-container" id="welcome-image"></div>
        `;
        
        // Creëer client voor deze aanvraag
        const client = new BotpressChatClient({
            webhookId: extractWebhookId(webhookId.trim())
        });
        
        // Verwijder de huidige conversatie
        try {
            await client.deleteConversation({
                userId,
                userKey,
                conversationId
            });
            console.log('Vorige conversatie verwijderd');
        } catch (error) {
            console.error('Fout bij verwijderen conversatie:', error);
            // We gaan toch door met een nieuwe conversatie maken
        }
        
        // Wis localStorage conversatie data
        localStorage.removeItem('conversationId');
        
        // Maak een nieuwe conversatie aan
        const conversationResult = await client.createConversation({
            userId,
            userKey
        });
        
        // Extraeer het conversatie ID op basis van het response formaat
        console.log('Nieuwe conversatie resultaat:', conversationResult);
        
        let newConversationId;
        
        // Haal conversatie ID op afhankelijk van het antwoordformaat
        if (conversationResult.id) {
            newConversationId = conversationResult.id;
            console.log('Nieuwe conversatie ID direct gevonden:', newConversationId);
        } else if (conversationResult.conversation && conversationResult.conversation.id) {
            newConversationId = conversationResult.conversation.id;
            console.log('Nieuwe conversatie ID in genest object gevonden:', newConversationId);
        } else {
            console.error('Kon geen conversatie ID vinden in antwoord:', conversationResult);
            throw new Error('Ongeldig antwoordformaat: geen conversatie ID gevonden');
        }
        
        // Sla de nieuwe conversatie ID op
        localStorage.setItem('conversationId', newConversationId);
        console.log('Nieuwe conversatie aangemaakt en opgeslagen:', newConversationId);
        
        // Laad styling opnieuw voor welkomstafbeelding
        const botId = localStorage.getItem('botId');
        await loadAndApplyStyling(botId);
        
    } catch (error) {
        console.error('Fout bij resetten chat:', error);
        addMessageToUI('Er is een fout opgetreden bij het herstarten van de chat. Probeer de pagina te vernieuwen.', 'bot');
    }
}

/**
 * Poll voor nieuwe berichten
 */
function pollForMessages() {
    if (isPolling) return;
    
    console.log('Start polling voor berichten...');
    isPolling = true;
    
    // Haal gegevens op uit localStorage
    const userId = localStorage.getItem('userId');
    
    pollingInterval = setInterval(async () => {
        try {
            const userKey = localStorage.getItem('userKey');
            const conversationId = localStorage.getItem('conversationId');
            const webhookId = localStorage.getItem('currentWebhookId');
            
            if (!userId || !userKey || !conversationId || !webhookId) {
                console.error('Ontbrekende gegevens voor polling', { userId, userKey, conversationId: conversationId || 'ontbreekt', webhookId });
                clearInterval(pollingInterval);
                isPolling = false;
                hideTypingIndicator();
                resetChatInterface();
                
                // Toon foutmelding als specifiek de conversatie ontbreekt
                if (!conversationId) {
                    console.error('Geen conversatie ID voor polling beschikbaar!');
                    document.getElementById('error-container').style.display = 'block';
                    document.getElementById('error-container').textContent = 
                        'Er is een fout opgetreden bij het ophalen van berichten: Geen geldige conversatie. Probeer de pagina te vernieuwen.';
                }
                
                return;
            }
            
            // Creëer client voor deze aanvraag
            const client = new BotpressChatClient({
                webhookId: extractWebhookId(webhookId.trim())
            });
            
            console.log('Polling voor berichten met conversationId:', conversationId);
            
            // Haal berichten op direct via de client
            const messages = await client.listMessages({
                conversationId,
                userId,
                userKey
            });
            
            // Log de ontvangen berichten voor debugging
            console.log('Berichten ontvangen:', messages);
            
            // Verwerk eventuele nieuwe berichten
            if (messages && messages.length > 0) {
                // Filter nieuwe berichten van de bot (niet van onszelf)
                const newBotMessages = messages.filter(msg => {
                    // Check of we dit bericht al hebben verwerkt
                    if (lastProcessedMessageIds.includes(msg.id)) {
                        return false;
                    }
                    
                    // Voeg toe aan verwerkte berichten
                    lastProcessedMessageIds.push(msg.id);
                    
                    // Bepaal of het een bot bericht is
                    return msg.direction === 'incoming' || 
                          msg.userId !== userId ||
                          (msg.payload && msg.payload.type === 'bot');
                });
                
                // Als er nieuwe berichten zijn
                if (newBotMessages.length > 0) {
                    // Verberg typing indicator
                    hideTypingIndicator();
                    
                    // Voeg nieuwe berichten toe aan de UI
                    for (const msg of newBotMessages) {
                        // Verbeterde logging voor debugging
                        console.log('Bericht verwerken:', msg);
                        console.log('Bericht type:', msg.payload?.type);
                        console.log('Payload eigenschappen:', Object.keys(msg.payload || {}));
                        
                        // Controleer of dit een Botpress choice message is
                        if (msg.payload && msg.payload.type === 'choice' && 
                            msg.payload.text && 
                            msg.payload.options && 
                            Array.isArray(msg.payload.options)) {
                            // Het is een Botpress multiple choice bericht
                            console.log('Multiple choice bericht gedetecteerd:', msg.payload);
                            
                            // Voeg de vraag toe als gewoon bericht
                            const questionText = msg.payload.text;
                            
                            // Voeg het bericht toe aan de UI met de vraag
                            const chatMessages = document.getElementById('chat-messages');
                            const messageDiv = document.createElement('div');
                            messageDiv.classList.add('message', 'bot');
                            
                            // Vraag toevoegen
                            const questionElement = document.createElement('div');
                            questionElement.className = 'bot-question';
                            questionElement.innerHTML = DOMPurify.sanitize(marked.parse(questionText), {
                                ADD_ATTR: ['target', 'rel']
                            });
                            messageDiv.appendChild(questionElement);
                            
                            // Opties container
                            const choicesContainer = document.createElement('div');
                            choicesContainer.className = 'multiple-choice-container';
                            
                            // Voeg elke optie toe
                            msg.payload.options.forEach(option => {
                                const optionText = option.label || option.text || option.value || option.title || '';
                                const optionValue = option.value || optionText;
                                
                                if (!optionText) return;
                                
                                const button = document.createElement('button');
                                button.className = 'multiple-choice-button';
                                button.textContent = optionText;
                                button.onclick = function() {
                                    if (!isWaitingForResponse) {
                                        sendUserMessage(optionValue);
                                    } else {
                                        showNotification("Even geduld, je vorige vraag wordt nog verwerkt...");
                                    }
                                };
                                
                                choicesContainer.appendChild(button);
                            });
                            
                            // Voeg knoppen toe
                            messageDiv.appendChild(choicesContainer);
                            
                            // Voeg CSS toe als deze nog niet bestaat
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
                            
                            // Voeg toe aan chatberichten
                            chatMessages.appendChild(messageDiv);
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        }
                        // Controleer of dit een dropdown/list message is
                        else if (msg.payload && 
                                (msg.payload.type === 'dropdown' || msg.payload.type === 'list') && 
                                msg.payload.text && 
                                ((msg.payload.items && Array.isArray(msg.payload.items)) || 
                                 (msg.payload.options && Array.isArray(msg.payload.options)))) {
                            // Het is een Botpress dropdown of list bericht
                            console.log('Dropdown/list bericht gedetecteerd:', msg.payload);
                            
                            // Voeg de vraag toe als gewoon bericht
                            const questionText = msg.payload.text;
                            
                            // Voeg het bericht toe aan de UI met de vraag
                            const chatMessages = document.getElementById('chat-messages');
                            const messageDiv = document.createElement('div');
                            messageDiv.classList.add('message', 'bot');
                            
                            // Vraag toevoegen
                            const questionElement = document.createElement('div');
                            questionElement.className = 'bot-question';
                            questionElement.innerHTML = DOMPurify.sanitize(marked.parse(questionText), {
                                ADD_ATTR: ['target', 'rel']
                            });
                            messageDiv.appendChild(questionElement);
                            
                            // Opties container
                            const choicesContainer = document.createElement('div');
                            choicesContainer.className = 'multiple-choice-container';
                            
                            // Bepaal welke array te gebruiken: items of options
                            const optionsArray = msg.payload.options || msg.payload.items;
                            
                            // Voeg elke optie toe
                            optionsArray.forEach(item => {
                                const itemText = item.label || item.text || item.title || item.value || '';
                                const itemValue = item.value || itemText;
                                
                                if (!itemText) return;
                                
                                const button = document.createElement('button');
                                button.className = 'multiple-choice-button';
                                button.textContent = itemText;
                                button.onclick = function() {
                                    if (!isWaitingForResponse) {
                                        sendUserMessage(itemValue);
                                    } else {
                                        showNotification("Even geduld, je vorige vraag wordt nog verwerkt...");
                                    }
                                };
                                
                                choicesContainer.appendChild(button);
                            });
                            
                            // Voeg knoppen toe
                            messageDiv.appendChild(choicesContainer);
                            
                            // Voeg CSS toe als deze nog niet bestaat
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
                            
                            // Voeg toe aan chatberichten
                            chatMessages.appendChild(messageDiv);
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        }
                        // Controleer of we een geldig tekstbericht hebben
                        else if (msg.payload && (msg.payload.text || msg.payload.message)) {
                            // Haal tekst uit het bericht, afhankelijk van het formaat
                            const messageText = msg.payload.text || 
                                               msg.payload.message || 
                                               (msg.payload.type === 'text' ? msg.payload.text : null);
                            
                            if (messageText) {
                                // Controleer of het bericht als tekst een keuzelijst bevat in Botpress formaat
                                // Bijvoorbeeld: "Kies een van de volgende opties: Optie 1, Optie 2, Optie 3"
                                const colonChoiceMatch = messageText.match(/(.*?):\s*([^,]+(?:,\s*[^,]+)+)$/);
                                
                                // Controleer of de vraag een keuzewoord bevat
                                const containsChoiceKeyword = colonChoiceMatch && 
                                    colonChoiceMatch[1] && 
                                    /kies|opties|keuzes|selecteer|maak een keuze|kies een|selecteer een|geef aan/i.test(colonChoiceMatch[1]);
                                
                                if (colonChoiceMatch && colonChoiceMatch[1] && colonChoiceMatch[2] && containsChoiceKeyword) {
                                    const question = colonChoiceMatch[1].trim();
                                    const optionsText = colonChoiceMatch[2].trim();
                                    const options = optionsText.split(/,\s*/).filter(opt => opt.trim() !== '');
                                    
                                    if (options.length > 1) {
                                        console.log('Keuzelijst in tekst gedetecteerd:', {
                                            question,
                                            options
                                        });
                                        
                                        // Voeg het bericht toe aan de UI met de vraag
                                        const chatMessages = document.getElementById('chat-messages');
                                        const messageDiv = document.createElement('div');
                                        messageDiv.classList.add('message', 'bot');
                                        
                                        // Vraag toevoegen
                                        const questionElement = document.createElement('div');
                                        questionElement.className = 'bot-question';
                                        questionElement.innerHTML = DOMPurify.sanitize(marked.parse(question), {
                                            ADD_ATTR: ['target', 'rel']
                                        });
                                        messageDiv.appendChild(questionElement);
                                        
                                        // Opties container
                                        const choicesContainer = document.createElement('div');
                                        choicesContainer.className = 'multiple-choice-container';
                                        
                                        // Voeg elke optie toe
                                        options.forEach(option => {
                                            const button = document.createElement('button');
                                            button.className = 'multiple-choice-button';
                                            button.textContent = option.trim();
                                            button.onclick = function() {
                                                if (!isWaitingForResponse) {
                                                    sendUserMessage(option.trim());
                                                } else {
                                                    showNotification("Even geduld, je vorige vraag wordt nog verwerkt...");
                                                }
                                            };
                                            
                                            choicesContainer.appendChild(button);
                                        });
                                        
                                        // Voeg knoppen toe
                                        messageDiv.appendChild(choicesContainer);
                                        
                                        // Voeg CSS toe als deze nog niet bestaat
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
                                        
                                        // Voeg toe aan chatberichten
                                        chatMessages.appendChild(messageDiv);
                                        chatMessages.scrollTop = chatMessages.scrollHeight;
                                    } else {
                                        // Geen meerdere opties gevonden, toon als normaal bericht
                                        addMessageToUI(messageText, 'bot');
                                    }
                                } else {
                                    // Geen keuzelijst gedetecteerd, toon als normaal bericht
                                    addMessageToUI(messageText, 'bot');
                                }
                            } else {
                                console.warn('Geen tekst gevonden in bericht payload:', msg.payload);
                            }
                        } else if (msg.payload && msg.payload.suggestions) {
                            // Verwerk suggesties als die aanwezig zijn
                            handleSuggestions(msg.payload.suggestions);
                        } else {
                            console.warn('Geen geldige payload in bericht:', msg);
                        }
                    }
                    
                    // Reset de chat status
                    resetChatInterface();
                    
                    // Stop polling
                    clearInterval(pollingInterval);
                    isPolling = false;
                }
            }
        } catch (error) {
            console.error('Fout bij polling berichten:', error);
            hideTypingIndicator();
            
            // Controleer of de fout aangeeft dat we geen deelnemer zijn
            if (error.message && error.message.includes('not a participant')) {
                console.error('Gebruiker is geen deelnemer van de conversatie');
                
                // Toon duidelijke foutmelding
                addMessageToUI('De chat sessie is ongeldig geworden. Reset de chat om door te gaan.', 'bot');
                
                // Voeg een reset knop toe in het berichten-gebied
                const resetButtonHTML = `
                    <div class="message-reset-container">
                        <button class="message-reset-button" onclick="resetChat()">Reset chat</button>
                    </div>
                `;
                document.getElementById('chat-messages').insertAdjacentHTML('beforeend', resetButtonHTML);
            } else {
                // Algemene foutmelding
                addMessageToUI('Er is een fout opgetreden bij het ophalen van berichten. Probeer het opnieuw.', 'bot');
            }
            
            resetChatInterface();
            clearInterval(pollingInterval);
            isPolling = false;
        }
    }, 1000); // Poll elke seconde
}

/**
 * Verwerk suggesties van de chatbot
 */
function handleSuggestions(suggestions) {
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
        console.log('Geen geldige suggesties ontvangen');
        return;
    }
    
    console.log('Suggesties ontvangen:', suggestions);
    
    // Voeg suggesties toe aan het UI als dynamische knoppen
    const chatMessages = document.getElementById('chat-messages');
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.className = 'dynamic-suggestions-container';
    
    suggestions.forEach(suggestion => {
        const text = typeof suggestion === 'string' ? suggestion : suggestion.text || suggestion.title || suggestion.value || '';
        
        if (!text) return;
        
        const button = document.createElement('button');
        button.className = 'dynamic-suggestion-button';
        button.textContent = text;
        button.onclick = function() {
            if (!isWaitingForResponse) {
                sendUserMessage(text);
            } else {
                showNotification("Even geduld, je vorige vraag wordt nog verwerkt...");
            }
        };
        
        suggestionsContainer.appendChild(button);
    });
    
    chatMessages.appendChild(suggestionsContainer);
    
    // Scroll naar beneden om suggesties te tonen
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Voeg CSS toe voor dynamische suggestieknoppen
    if (!document.querySelector('style[data-dynamic-suggestions="true"]')) {
        const styleEl = document.createElement('style');
        styleEl.setAttribute('data-dynamic-suggestions', 'true');
        styleEl.textContent = `
            .dynamic-suggestions-container {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin: 10px 0;
                padding: 0 15px;
            }
            
            .dynamic-suggestion-button {
                background-color: var(--primary-color, #007bff);
                color: white;
                border: none;
                border-radius: 18px;
                padding: 8px 15px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
                opacity: 0.9;
            }
            
            .dynamic-suggestion-button:hover {
                opacity: 1;
                transform: scale(1.05);
            }
        `;
        document.head.appendChild(styleEl);
    }
} 