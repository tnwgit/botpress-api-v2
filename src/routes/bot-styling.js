// PUT route voor het bewerken van bot styling
router.post('/:id', async (req, res) => {
    const botId = req.params.id;
    console.log(`[${new Date().toISOString()}] POST /api/bot-styling/${botId} - Styling opslaan verzoek ontvangen`);

    try {
        // Controleer of we styling data hebben ontvangen
        if (!req.body || (!req.body.styling && !req.body)) {
            console.error(`Geen styling data ontvangen voor bot ${botId}`);
            return res.status(400).json({ message: 'Geen styling data meegegeven' });
        }
        
        // Haal styling uit het request
        const styling = req.body.styling || req.body;
        
        console.log(`Styling voor bot ${botId} opslaan:`, 
            JSON.stringify(styling, null, 2).substring(0, 200) + '...');

        // Controleer of Supabase geconfigureerd is
        if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
            // Supabase client initialiseren
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_KEY;
            const supabase = createClient(supabaseUrl, supabaseKey);

            console.log(`Styling opslaan in Supabase voor bot: ${botId}`);
            
            // Check of de bot styling al bestaat in de database
            const { data: existingData, error: checkError } = await supabase
                .from('bot_styling')
                .select('*')
                .eq('bot_id', botId)
                .maybeSingle();
                
            if (checkError) {
                console.error(`Fout bij controleren van bestaande styling voor bot ${botId}:`, checkError);
            }
            
            let result;
            
            if (existingData) {
                // Update bestaande styling
                console.log(`Bestaande styling gevonden voor bot ${botId}, update uitvoeren`);
                result = await supabase
                    .from('bot_styling')
                    .update({ styling: styling })
                    .eq('bot_id', botId);
            } else {
                // Insert nieuwe styling
                console.log(`Geen bestaande styling gevonden voor bot ${botId}, nieuwe aanmaken`);
                result = await supabase
                    .from('bot_styling')
                    .insert([{ bot_id: botId, styling: styling }]);
            }
            
            if (result.error) {
                console.error(`Fout bij opslaan styling in Supabase voor bot ${botId}:`, result.error);
                return res.status(500).json({ 
                    message: 'Kan styling niet opslaan in Supabase', 
                    error: result.error 
                });
            }
            
            console.log(`Styling succesvol opgeslagen in Supabase voor bot ${botId}`);
            
            // Sla ook op in lokale cache voor fallback
            try {
                const stylingData = JSON.parse(fs.readFileSync('./data/styling.json', 'utf-8'));
                stylingData[botId] = styling;
                fs.writeFileSync('./data/styling.json', JSON.stringify(stylingData, null, 2));
                console.log(`Styling ook opgeslagen in lokale cache voor bot ${botId}`);
            } catch (err) {
                console.warn(`Kon styling niet opslaan in lokale cache voor bot ${botId}:`, err);
                // Geen fout teruggeven, Supabase opslag is gelukt
            }
            
            return res.json({ success: true, message: 'Styling succesvol opgeslagen in Supabase' });
        } else {
            // Supabase niet geconfigureerd, gebruik lokale opslag
            console.log('Supabase niet geconfigureerd, styling opslaan in lokale opslag');
            
            // Check of de data directory bestaat, zo niet, maak deze aan
            if (!fs.existsSync('./data')) {
                fs.mkdirSync('./data', { recursive: true });
                console.log('Data directory aangemaakt');
            }
            
            // Check of styling.json bestaat, zo niet, maak een leeg object aan
            let stylingData = {};
            try {
                if (fs.existsSync('./data/styling.json')) {
                    stylingData = JSON.parse(fs.readFileSync('./data/styling.json', 'utf-8'));
                }
            } catch (error) {
                console.error('Fout bij lezen van styling.json, nieuwe aanmaken:', error);
            }
            
            // Sla de styling op in het object
            stylingData[botId] = styling;
            
            // Schrijf het bestand
            try {
                fs.writeFileSync('./data/styling.json', JSON.stringify(stylingData, null, 2));
                console.log(`Styling succesvol opgeslagen in lokale opslag voor bot ${botId}`);
                
                return res.json({ success: true, message: 'Styling succesvol opgeslagen in lokale opslag' });
            } catch (error) {
                console.error('Fout bij schrijven naar styling.json:', error);
                
                return res.status(500).json({ 
                    message: 'Kan styling niet opslaan in lokale opslag',
                    error: error.message
                });
            }
        }
    } catch (error) {
        console.error(`Onverwachte fout bij opslaan styling voor bot ${botId}:`, error);
        
        return res.status(500).json({ 
            message: 'Onverwachte fout bij opslaan styling',
            error: error.message
        });
    }
}); 