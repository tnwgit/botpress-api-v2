// Supabase client configuratie
const supabaseUrl = 'https://clngtypfotklhyekznzi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsbmd0eXBmb3RrbGh5ZWt6bnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIxNjI5MTIsImV4cCI6MjA1NzczODkxMn0.89eVhGEdDrQzQQ82zo_OizlzJ4K9X3xGIliwSOf2H8A';

// Creëer client zonder ES modules
let supabase;

// Wacht tot de supabase library is geladen
document.addEventListener('DOMContentLoaded', function() {
    // Controleer of supabase al beschikbaar is
    if (typeof supabaseClient !== 'undefined') {
        supabase = supabaseClient;
    } else if (typeof window.supabase !== 'undefined') {
        // Als de CDN client beschikbaar is in het window object
        try {
            supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
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
            console.log('Supabase client geïnitialiseerd via window.supabase');
        } catch (error) {
            console.error('Fout bij initialiseren van Supabase client:', error);
        }
    } else {
        console.error('Supabase client niet beschikbaar. Zorg ervoor dat de Supabase script is geladen.');
    }
});

// Functie om alle bots op te halen
async function getBots() {
    try {
        console.log('Ophalen bots van Supabase...');
        if (!supabase) {
            console.error('Supabase client is niet geïnitialiseerd');
            console.log('Probeer supabase opnieuw te initialiseren...');
            
            // Probeer supabase opnieuw te initialiseren
            if (typeof window.supabase !== 'undefined') {
                supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
                    auth: { persistSession: false },
                    global: {
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${supabaseKey}`
                        }
                    }
                });
            } else {
                return [];
            }
        }
        
        const { data, error } = await supabase
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

// Functie om een nieuwe bot toe te voegen
async function addBot(name, webhookId) {
    try {
        console.log('Toevoegen nieuwe bot:', { name, webhookId });
        if (!supabase) {
            console.error('Supabase client is niet geïnitialiseerd');
            return null;
        }
        
        const { data, error } = await supabase
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

// Functie om een bot te verwijderen
async function deleteBot(id) {
    try {
        console.log('Verwijderen bot:', id);
        if (!supabase) {
            console.error('Supabase client is niet geïnitialiseerd');
            return false;
        }
        
        const { error } = await supabase
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

// Functie om een bot bij te werken
async function updateBot(id, name, webhookId) {
    try {
        console.log('Bijwerken assistent:', { id, name, webhookId });
        if (!supabase) {
            console.error('Supabase client is niet geïnitialiseerd');
            return null;
        }
        
        const { data, error } = await supabase
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