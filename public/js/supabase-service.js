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
        
        console.log('Styling opgehaald:', data);
        return data || {}; // Return leeg object als er geen styling is
    } catch (error) {
        console.error('Error fetching bot styling:', error);
        return {};
    }
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