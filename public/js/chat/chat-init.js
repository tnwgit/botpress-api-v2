/**
 * Chat initialisatie en event handlers
 */

// Wacht tot het document geladen is
document.addEventListener('DOMContentLoaded', async function() {
    // Haal botId uit URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const botId = urlParams.get('botId');
    
    if (!botId) {
        // Toon foutmelding als er geen botId is
        document.getElementById('error-container').style.display = 'block';
        console.error('Geen botId opgegeven in URL parameters');
        return;
    }
    
    try {
        // Haal bot informatie op
        const response = await fetch(`/api/bots/${botId}`);
        
        if (!response.ok) {
            // Fallback: Check of er een botId in localStorage is
            const cachedBotId = localStorage.getItem('botId');
            const cachedBotName = localStorage.getItem('botName');
            const cachedWebhookId = localStorage.getItem('currentWebhookId');
            
            if (cachedBotId === botId && cachedBotName && cachedWebhookId) {
                console.log('Bot gegevens gevonden in cache');
                
                // Update titel
                document.getElementById('bot-name').textContent = `Chat met ${cachedBotName}`;
                document.title = `Chat met ${cachedBotName}`;
                
                // Laad en pas styling toe
                await loadAndApplyStyling(botId);
                
                // Initialiseer chat
                initChat();
                return;
            }
            
            throw new Error(`Bot niet gevonden: ${botId}`);
        }
        
        const botData = await response.json();
        
        // Sla gegevens op in localStorage
        localStorage.setItem('botId', botId);
        localStorage.setItem('botName', botData.name);
        localStorage.setItem('currentWebhookId', botData.webhook_id);
        
        // Update titel
        document.getElementById('bot-name').textContent = `Chat met ${botData.name}`;
        document.title = `Chat met ${botData.name}`;
        
        // Laad styling en initialiseer chat
        await loadAndApplyStyling(botId);
        initChat();
        
    } catch (error) {
        console.error('Fout bij laden assistent:', error);
        document.getElementById('error-container').style.display = 'block';
        document.getElementById('error-container').textContent = 
            'Er is een fout opgetreden bij het laden van de assistent. Controleer of de ID in de URL correct is.';
    }
    
    // Verberg de loading indicator
    setTimeout(hideLoadingOverlay, 1000);
});

/**
 * Laad en pas styling toe
 */
async function loadAndApplyStyling(botId) {
    try {
        if (!botId) {
            throw new Error('Geen botId opgegeven voor styling');
        }
        
        console.log('Ophalen styling voor bot', botId);
        
        // Haal styling data op
        const response = await fetch(`/api/bot-styling/${botId}`);
        
        if (!response.ok) {
            throw new Error(`Kon styling niet ophalen: ${response.status} ${response.statusText}`);
        }
        
        // Styling data
        const styleData = await response.json();
        console.log('Toepassen van styling:', styleData);
        
        // Pas styling toe
        if (styleData) {
            // Algemene styling
            if (styleData.general) {
                // Titel
                if (styleData.general.title) {
                    document.getElementById('bot-name').textContent = styleData.general.title;
                }
                
                // Logo
                if (styleData.general.logo) {
                    const logoImg = document.getElementById('bot-logo-img');
                    logoImg.src = styleData.general.logo;
                    logoImg.style.display = 'block';
                }
                
                // Welkomstafbeelding
                const welcomeContainer = document.getElementById('welcome-image');
                if (welcomeContainer) {
                    welcomeContainer.innerHTML = ''; // Maak container altijd eerst leeg
                    
                    // Controleer of er een geldige welkomstafbeelding URL is die niet verwijst naar het ontbrekende bestand
                    const invalidImagePaths = [
                        'img/welcome-bot.svg', 
                        '/img/welcome-bot.svg', 
                        '3500/img/welcome-bot.svg',
                        ':3500/img/welcome-bot.svg'
                    ];
                    
                    const hasValidImage = styleData.general.welcomeImage && 
                        !invalidImagePaths.some(path => styleData.general.welcomeImage.includes(path));
                    
                    if (hasValidImage) {
                        // Maak en voeg afbeelding toe
                        const img = document.createElement('img');
                        img.src = styleData.general.welcomeImage;
                        img.alt = 'Welkom';
                        welcomeContainer.appendChild(img);
                    } else {
                        // Gebruik inline SVG als fallback voor welkomstafbeelding
                        const fallbackSvg = document.createElement('div');
                        fallbackSvg.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="welcome-icon">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                                <line x1="15" y1="9" x2="15.01" y2="9"></line>
                            </svg>
                        `;
                        fallbackSvg.style.color = styleData.colors?.primary || '#2C6BED';
                        fallbackSvg.style.opacity = '0.8';
                        fallbackSvg.style.textAlign = 'center';
                        welcomeContainer.appendChild(fallbackSvg);
                    }
                }
            }
            
            // Kleuren
            if (styleData.colors) {
                const header = document.querySelector('.chat-header');
                header.style.backgroundColor = styleData.colors.primary;
                
                // Text kleuren
                if (styleData.colors.titleText) {
                    document.getElementById('bot-name').style.color = styleData.colors.titleText;
                }
                
                // CSS variabelen voor kleuren
                document.documentElement.style.setProperty('--primary-color', styleData.colors.primary);
                
                // Styling voor berichten
                const styleEl = document.createElement('style');
                styleEl.textContent = `
                    .message.user {
                        background-color: ${styleData.colors.userBubble || styleData.colors.primary};
                        color: ${styleData.colors.userText || 'white'};
                    }
                    .message.bot {
                        background-color: ${styleData.colors.botBubble || '#f8f9fa'};
                        color: ${styleData.colors.botText || '#212529'};
                    }
                    #send-btn {
                        background-color: ${styleData.colors.primary};
                    }
                `;
                document.head.appendChild(styleEl);
            }
            
            // Text placeholders
            if (styleData.text && styleData.text.placeholderText) {
                document.getElementById('message-input').placeholder = styleData.text.placeholderText;
            }
            
            // Suggesties
            if (styleData.suggestions && Array.isArray(styleData.suggestions)) {
                const suggestionsPanel = document.querySelector('.suggestions-panel');
                suggestionsPanel.innerHTML = '<h3>Voorgestelde vragen</h3>';
                
                // Toon suggesties panel op basis van dimensie-instelling
                const showSuggestionsPanel = styleData.dimensions?.showSuggestionsPanel !== false;
                
                if (styleData.suggestions.length > 0 && showSuggestionsPanel) {
                    styleData.suggestions.forEach(suggestion => {
                        const btn = document.createElement('button');
                        btn.className = 'suggestion-button';
                        btn.textContent = suggestion;
                        btn.onclick = function() {
                            if (!isWaitingForResponse) {
                                // Verzend direct zonder in het input veld te zetten
                                sendUserMessage(suggestion);
                            } else {
                                // Blokkeer nieuwe berichten zonder melding te tonen
                                return;
                            }
                        };
                        suggestionsPanel.appendChild(btn);
                    });
                    // Toon het suggestiepaneel
                    suggestionsPanel.style.display = 'block';
                } else {
                    // Verberg suggesties paneel als er geen suggesties zijn of als showSuggestionsPanel false is
                    suggestionsPanel.style.display = 'none';
                }
            } else {
                // Verberg suggesties paneel als er geen suggesties property is
                document.querySelector('.suggestions-panel').style.display = 'none';
            }
            
            // Afmetingen
            if (styleData.dimensions) {
                const chatMain = document.querySelector('.chat-main');
                const chatMessages = document.querySelector('.chat-messages');
                const chatWithSuggestions = document.querySelector('.chat-with-suggestions');
                const suggestionsPanel = document.querySelector('.suggestions-panel');
                const feedbackInner = document.querySelector('.feedback-inner');
                const chatColumn = document.querySelector('.chat-column');
                const typingIndicator = document.querySelector('.typing-indicator');
                
                // Pas afmetingen toe
                let chatWidth = 600; // Standaard breedte
                let chatHeight = 600; // Standaard hoogte
                
                if (styleData.dimensions.chatHeight) {
                    chatHeight = parseInt(styleData.dimensions.chatHeight) || 600;
                }
                
                if (styleData.dimensions.chatWidth) {
                    chatWidth = parseInt(styleData.dimensions.chatWidth) || 600;
                    
                    // Pas de breedte van de chat kolom aan
                    if (chatColumn) {
                        chatColumn.style.width = `${chatWidth}px`;
                        chatColumn.style.minWidth = `${chatWidth}px`; // Voorkom krimpen
                    }
                    
                    // Pas de chat main container aan
                    if (chatMain) {
                        chatMain.style.width = '100%';
                    }
                    
                    // Pas ook de breedte van het feedback panel aan
                    if (feedbackInner) {
                        feedbackInner.style.width = '100%';
                    }
                }
                
                // Extra lettergrootte consistentie voor inputvelden en berichten
                const fontConsistencyStyle = document.createElement('style');
                fontConsistencyStyle.setAttribute('data-consistency', 'true');
                fontConsistencyStyle.textContent = `
                    /* Extra lettergrootte consistentie */
                    #message-input, .feedback-input, textarea.feedback-input {
                        font-size: 15px !important;
                    }
                    .message, .message.user, .message.bot {
                        font-size: 15px !important;
                    }
                    
                    /* Media queries voor mobiele apparaten */
                    @media (max-width: 480px) {
                        #message-input, .feedback-input, textarea.feedback-input {
                            font-size: 15px !important;
                        }
                        .message, .message.user, .message.bot {
                            font-size: 15px !important;
                        }
                    }
                `;
                document.head.appendChild(fontConsistencyStyle);
                
                // Pas de kleur van de typing indicator aan
                if (styleData.colors && styleData.colors.primary && typingIndicator) {
                    const dots = typingIndicator.querySelectorAll('.dot');
                    dots.forEach(dot => {
                        dot.style.background = styleData.colors.primary;
                    });
                }
                
                // Stel initiële hoogte in
                if (chatMain) {
                    chatMain.style.height = `${chatHeight}px`;
                    chatMain.style.minHeight = `${chatHeight}px`;
                }
                
                if (chatMessages) {
                    // Trek de hoogte van header (60px) en input gebied (75px) af
                    const messageAreaHeight = chatHeight - 135;
                    chatMessages.style.height = `${messageAreaHeight}px`;
                    chatMessages.style.minHeight = `${messageAreaHeight}px`;
                }
            }
            
            // Maak de layout responsief
            const dimStyleEl = document.createElement('style');
            dimStyleEl.setAttribute('data-dimensions', 'bot-custom');
            
            // Voeg media queries toe voor responsieve layout
            dimStyleEl.textContent = `
                @media (max-width: 900px) {
                    .chat-main {
                        width: 100% !important;
                        max-width: 100% !important;
                        min-width: 100% !important;
                    }
                }
            `;
            
            document.head.appendChild(dimStyleEl);
            
            console.log('Bot styling succesvol toegepast');
        }
    } catch (error) {
        console.error('Fout bij toepassen styling:', error);
    }
}

/**
 * Chat initialisatie
 */
function initChat() {
    // Event listeners voor chat interactie
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-btn');
    const resetButton = document.querySelector('.reset-button');
    
    // Voeg stijlen toe voor reset knoppen
    addResetButtonStyles();
    
    // Auto-resize textarea
    messageInput.addEventListener('input', function() {
        this.style.height = '40px';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    
    // Verzend bericht bij klikken op verzendknop
    sendButton.addEventListener('click', function() {
        const text = messageInput.value.trim();
        if (text) {
            sendUserMessage(text);
            // Verwijderd omdat dit nu in sendUserMessage gebeurt
        }
    });
    
    // Verzend bericht bij drukken op Enter (zonder Shift)
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendButton.click();
        }
    });
    
    // Reset chat bij klikken op reset knop
    resetButton.addEventListener('click', resetChat);
    
    // Voorgestelde vragen klikbaar maken
    const suggestionButtons = document.querySelectorAll('.suggestion-button');
    suggestionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const text = this.textContent.trim();
            if (text && !isWaitingForResponse) {
                // Verzend direct zonder in het input veld te zetten
                sendUserMessage(text);
            } else if (isWaitingForResponse) {
                // Blokkeer nieuwe berichten zonder melding te tonen
                return;
            }
        });
    });
    
    // Initialiseer de chat sessie
    initializeChat();
}

/**
 * Feedback functionaliteit
 */
document.addEventListener('DOMContentLoaded', function() {
    const feedbackBtns = document.querySelectorAll('.rating-btn');
    const feedbackText = document.getElementById('feedback-text');
    const submitFeedbackBtn = document.getElementById('submit-feedback');
    const feedbackMsg = document.getElementById('feedback-msg');
    let selectedRating = null;
    
    // Event listeners voor feedback knoppen
    feedbackBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Verwijder actieve klasse van alle knoppen
            feedbackBtns.forEach(b => b.classList.remove('selected'));
            // Voeg actieve klasse toe aan geselecteerde knop
            btn.classList.add('selected');
            // Sla numerieke rating op
            selectedRating = parseInt(btn.dataset.rating);
        });
    });
    
    // Event listener voor versturen feedback
    submitFeedbackBtn.addEventListener('click', async () => {
        if (!selectedRating) {
            feedbackMsg.textContent = "Selecteer eerst een waardering";
            feedbackMsg.className = "feedback-error";
            return;
        }
        
        try {
            const botId = localStorage.getItem('botId');
            const userId = localStorage.getItem('userId');
            const conversationId = localStorage.getItem('conversationId');
            const name = document.getElementById('feedback-name').value.trim();
            
            // Verzamel alle berichten uit de chat
            const chatMessages = document.querySelectorAll('.message');
            const chatHistory = Array.from(chatMessages).map(msg => {
                const isUser = msg.classList.contains('user');
                return {
                    type: isUser ? 'user' : 'bot',
                    text: msg.textContent || ''
                };
            });

            // Verstuur data naar Google Apps Script web app
            const response = await fetch('https://script.google.com/macros/s/AKfycby_hi7XVldGvbVmJISB3YdoXgnhbykJMnjutl3m2i77KLY1aYNzKejlQPjkdsuTC5Xh/exec', {
                method: 'POST',
                mode: 'no-cors', // Belangrijk voor cross-origin requests
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    timestamp: new Date().toISOString(),
                    botId,
                    name: name || 'Anoniem',
                    rating: selectedRating,
                    comment: feedbackText.value.trim(),
                    userId,
                    conversationId,
                    chatHistory: JSON.stringify(chatHistory)
                })
            });
            
            // Toon success message
            feedbackMsg.textContent = "Bedankt voor je feedback!";
            feedbackMsg.className = "feedback-success";
            
            // Reset het formulier
            selectedRating = null;
            document.querySelectorAll('.rating-btn').forEach(btn => btn.classList.remove('selected'));
            document.getElementById('feedback-name').value = '';
            feedbackText.value = '';
            
        } catch (error) {
            console.error('Fout bij versturen feedback:', error);
            feedbackMsg.textContent = "Er ging iets mis bij het versturen van je feedback";
            feedbackMsg.className = "feedback-error";
        }
    });
}); 