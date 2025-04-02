/**
 * Supabase Service Module
 * 
 * Dit bestand bevat alle Supabase-gerelateerde functionaliteit, inclusief bot management,
 * styling, chatgeschiedenis en configuratie.
 */

const supabaseUrl = 'https://clngtypfotklhyekznzi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsbmd0eXBmb3RrbGh5ZWt6bnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIxNjI5MTIsImV4cCI6MjA1NzczODkxMn0.89eVhGEdDrQzQQ82zo_OizlzJ4K9X3xGIliwSOf2H8A';

let supabase = null;

/**
 * Initialiseer de Supabase client
 * Deze functie zorgt ervoor dat we de Supabase client maar één keer aanmaken
 */
async function initSupabase() {
    if (supabase) return supabase;

    try {
        // Dynamisch importeren van de Supabase client
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm');

        supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false
            },
            global: {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                }
            }
        });

        console.log('Supabase client succesvol geïnitialiseerd');
        return supabase;
    } catch (error) {
        console.error('Fout bij initialiseren Supabase client:', error);
        throw error;
    }
}

/**
 * Haal alle bots op uit Supabase
 * @returns {Array} Array van bot objecten
 */
export async function getBots() {
    try {
        const client = await initSupabase();
        console.log('Ophalen bots van Supabase...');
        
        const { data, error } = await client
            .from('bots')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }
        
        console.log('Bots opgehaald:', data);
        return data;
    } catch (error) {
        console.error('Error fetching bots:', error);
        return [];
    }
}

/**
 * Voeg een nieuwe bot toe aan Supabase
 * @param {string} name - Naam van de bot
 * @param {string} webhookId - Webhook ID van de bot
 * @returns {Object} Het aangemaakte bot object
 */
export async function addBot(name, webhookId) {
    try {
        const client = await initSupabase();
        console.log('Toevoegen nieuwe bot:', { name, webhookId });
        
        const { data, error } = await client
            .from('bots')
            .insert([{ name, webhook_id: webhookId }])
            .select()
            .single();

        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }
        
        console.log('Bot toegevoegd:', data);
        return data;
    } catch (error) {
        console.error('Error adding bot:', error);
        return null;
    }
}

/**
 * Verwijder een bot uit Supabase
 * @param {string} id - ID van de bot om te verwijderen
 * @returns {boolean} True als het verwijderen succesvol was
 */
export async function deleteBot(id) {
    try {
        const client = await initSupabase();
        console.log('Verwijderen bot:', id);
        
        const { error } = await client
            .from('bots')
            .delete()
            .eq('id', id);
        
        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }
        
        console.log('Bot verwijderd');
        return true;
    } catch (error) {
        console.error('Error deleting bot:', error);
        return false;
    }
}

/**
 * Update een bestaande bot in Supabase
 * @param {string} id - ID van de bot
 * @param {string} name - Nieuwe naam van de bot
 * @param {string} webhookId - Nieuwe webhook ID van de bot
 * @returns {Object} Het bijgewerkte bot object
 */
export async function updateBot(id, name, webhookId) {
    try {
        const client = await initSupabase();
        console.log('Bijwerken assistent:', { id, name, webhookId });
        
        const { data, error } = await client
            .from('bots')
            .update({ name, webhook_id: webhookId })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }
        
        console.log('Assistent bijgewerkt:', data);
        return data;
    } catch (error) {
        console.error('Error updating assistant:', error);
        return null;
    }
}

/**
 * Haal styling configuratie op voor een specifieke bot
 * @param {string} botId - ID van de bot
 * @returns {Object} Styling configuratie object
 */
export async function getBotStyling(botId) {
    try {
        const client = await initSupabase();
        console.log(`Ophalen styling voor bot ${botId}...`);
        
        const { data, error } = await client
            .from('bot_styling')
            .select('*')
            .eq('bot_id', botId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "niet gevonden" error
            console.error('Supabase error:', error);
            throw error;
        }
        
        if (!data) {
            console.log('Geen styling gevonden voor bot, gebruik standaard styling');
            return getDefaultStyling();
        }
        
        console.log('Ruwe styling data opgehaald:', data);
        
        // Controleer of we een genest styling object hebben of een plat object
        let stylingData;
        
        // Geval 1: We hebben een data.styling object dat alle informatie bevat
        if (data.styling && typeof data.styling === 'object') {
            console.log('Styling data gevonden in nested styling property:', data.styling);
            stylingData = data.styling;
            
            // Controleer of de data in het juiste formaat is (geneste structuur)
            if (stylingData.general || stylingData.colors || stylingData.text || stylingData.dimensions) {
                console.log('Styling data heeft het juiste geneste formaat');
                return stylingData;
            } else {
                console.log('Styling data heeft niet het juiste formaat, conversie uitvoeren');
                // Probeer conversie naar gestructureerd formaat
                return convertToStructuredStyling(stylingData);
            }
        } 
        // Geval 2: We hebben een plat object zonder styling property
        else {
            console.log('Styling data lijkt een plat object te zijn zonder styling property');
            // Maak een kopie zodat we database-specifieke velden kunnen verwijderen
            const cleanedData = { ...data };
            delete cleanedData.bot_id;
            delete cleanedData.id;
            delete cleanedData.created_at;
            delete cleanedData.updated_at;
            
            // Probeer conversie naar gestructureerd formaat
            return convertToStructuredStyling(cleanedData);
        }
    } catch (error) {
        console.error('Error fetching bot styling:', error);
        return getDefaultStyling();
    }
}

// Helper functie om styling data te converteren naar het gestandaardiseerde formaat
function convertToStructuredStyling(data) {
    console.log('Converteer data naar gestructureerd formaat:', data);
    
    // Check of data al in het juiste formaat is
    if (data.general && data.colors && data.text && data.dimensions) {
        console.log('Data al in het juiste formaat');
        return data;
    }
    
    // Conversie van platte structuur naar geneste structuur
    try {
        const structuredStyling = {
            general: {
                title: data.title || data.name || 'Chat Assistent',
                logo: data.logo_url || data.logo || '',
                welcomeImage: data.welcome_image_url || data.welcomeImage || '',
                fontFamily: data.font_family || data.fontFamily || 'Arial, sans-serif'
            },
            colors: {
                primary: data.primary_color || data.primary || '#2C6BED',
                background: data.background_color || data.background || '#FFFFFF',
                userBubble: data.user_message_color || data.userBubble || '#2C6BED',
                botBubble: data.bot_message_color || data.botBubble || '#F0F0F0',
                userText: data.user_message_text_color || data.userText || '#FFFFFF',
                botText: data.bot_message_text_color || data.botText || '#333333',
                titleText: data.header_text_color || data.titleText || '#FFFFFF'
            },
            text: {
                welcomeMessage: data.welcome_message || data.welcomeMessage || 'Hallo! Hoe kan ik je helpen?',
                placeholderText: data.user_input_placeholder || data.placeholderText || 'Type je bericht...'
            },
            dimensions: {
                chatWidth: parseInt(data.width || data.chatWidth) || 400,
                chatHeight: parseInt(data.height || data.chatHeight) || 600,
                borderRadius: parseInt(data.border_radius || data.borderRadius) || 8,
                showSuggestionsPanel: data.show_suggestions_panel !== false
            },
            suggestions: data.suggestions || []
        };
        
        console.log('Conversie naar gestructureerd formaat voltooid:', structuredStyling);
        return structuredStyling;
    } catch (error) {
        console.error('Fout bij converteren naar gestructureerd formaat:', error);
        return getDefaultStyling();
    }
}

// Standaard styling voor als er geen styling is gevonden
function getDefaultStyling() {
    return {
        general: {
            title: 'Chat Assistent',
            logo: '',
            welcomeImage: '',
            fontFamily: 'Arial, sans-serif'
        },
        colors: {
            primary: '#2C6BED',
            background: '#FFFFFF',
            userBubble: '#2C6BED',
            botBubble: '#F0F0F0',
            userText: '#FFFFFF',
            botText: '#333333',
            titleText: '#FFFFFF'
        },
        text: {
            welcomeMessage: 'Hallo! Hoe kan ik je helpen?',
            placeholderText: 'Type je bericht...'
        },
        dimensions: {
            chatWidth: 400,
            chatHeight: 600,
            borderRadius: 8,
            showSuggestionsPanel: true
        },
        suggestions: []
    };
}

/**
 * Sla styling configuratie op voor een specifieke bot
 * @param {string} botId - ID van de bot
 * @param {Object} stylingConfig - Styling configuratie object
 * @returns {Object} Het opgeslagen styling object
 */
export async function saveBotStyling(botId, stylingConfig) {
    try {
        const client = await initSupabase();
        console.log(`Opslaan styling voor bot ${botId}...`);
        
        // Controleer of er al styling bestaat voor deze bot
        const { data: existingData, error: checkError } = await client
            .from('bot_styling')
            .select('id')
            .eq('bot_id', botId)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Supabase error:', checkError);
            throw checkError;
        }

        let result;
        
        if (existingData) {
            // Update bestaande styling
            console.log(`Bestaande styling gevonden voor bot ${botId}, bijwerken...`);
            result = await client
                .from('bot_styling')
                .update(stylingConfig)
                .eq('bot_id', botId)
                .select()
                .single();
        } else {
            // Maak nieuwe styling aan
            console.log(`Geen bestaande styling gevonden voor bot ${botId}, aanmaken...`);
            result = await client
                .from('bot_styling')
                .insert([{ bot_id: botId, ...stylingConfig }])
                .select()
                .single();
        }
        
        if (result.error) {
            console.error('Supabase error:', result.error);
            throw result.error;
        }
        
        console.log('Styling opgeslagen:', result.data);
        return result.data;
    } catch (error) {
        console.error('Error saving bot styling:', error);
        return null;
    }
}

/**
 * Sla een chatbericht op in de chatgeschiedenis
 * @param {string} botId - ID van de bot
 * @param {string} userId - ID van de gebruiker
 * @param {string} conversationId - ID van de conversatie
 * @param {string} message - Het bericht
 * @param {boolean} isUser - Of het een gebruikersbericht is
 * @returns {Object} Het opgeslagen bericht object
 */
export async function saveChatMessage(botId, userId, conversationId, message, isUser) {
    try {
        const client = await initSupabase();
        console.log(`Opslaan chatbericht voor bot ${botId}...`);
        
        const messageData = {
            bot_id: botId,
            user_id: userId,
            conversation_id: conversationId,
            message,
            is_user: isUser,
            timestamp: new Date().toISOString()
        };
        
        const { data, error } = await client
            .from('chat_history')
            .insert([messageData])
            .select()
            .single();

        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }
        
        console.log('Chatbericht opgeslagen:', data);
        return data;
    } catch (error) {
        console.error('Error saving chat message:', error);
        return null;
    }
}

/**
 * Haal chatgeschiedenis op voor een specifieke conversatie
 * @param {string} conversationId - ID van de conversatie
 * @returns {Array} Array van bericht objecten
 */
export async function getChatHistory(conversationId) {
    try {
        const client = await initSupabase();
        console.log(`Ophalen chatgeschiedenis voor conversatie ${conversationId}...`);
        
        const { data, error } = await client
            .from('chat_history')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: true });

        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }
        
        console.log(`${data.length} berichten opgehaald uit chatgeschiedenis`);
        return data;
    } catch (error) {
        console.error('Error fetching chat history:', error);
        return [];
    }
}

/**
 * Haal een specifieke bot op basis van ID
 * @param {string} botId - ID van de bot
 * @returns {Object} Bot object
 */
export async function getBotById(botId) {
    try {
        const client = await initSupabase();
        console.log(`Ophalen bot met ID ${botId}...`);
        
        const { data, error } = await client
            .from('bots')
            .select('*')
            .eq('id', botId)
            .single();

        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }
        
        console.log('Bot opgehaald:', data);
        return data;
    } catch (error) {
        console.error('Error fetching bot:', error);
        return null;
    }
} 