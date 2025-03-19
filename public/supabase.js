import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm'

const supabaseUrl = 'https://clngtypfotklhyekznzi.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsbmd0eXBmb3RrbGh5ZWt6bnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIxNjI5MTIsImV4cCI6MjA1NzczODkxMn0.89eVhGEdDrQzQQ82zo_OizlzJ4K9X3xGIliwSOf2H8A'

const supabase = createClient(supabaseUrl, supabaseKey)

// Functie om alle bots op te halen
export async function getBots() {
    try {
        console.log('Ophalen bots van Supabase...');
        const { data, error } = await supabase
            .from('bots')
            .select('*')
            .order('created_at', { ascending: false })

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
export async function addBot(name, webhookId) {
    try {
        console.log('Toevoegen nieuwe bot:', { name, webhookId });
        const { data, error } = await supabase
            .from('bots')
            .insert([{ name, webhook_id: webhookId }])
            .select()
            .single()

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
export async function deleteBot(id) {
    try {
        console.log('Verwijderen bot:', id);
        const { error } = await supabase
            .from('bots')
            .delete()
            .eq('id', id)

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