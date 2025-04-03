function doPost(e) {
  try {
    // Get the sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Parse the incoming data
    const data = JSON.parse(e.postData.contents);
    
    // Format the date
    const now = new Date();
    
    // Prepare the row data
    const rowData = [
      now, // Datum
      data.botId || '',
      data.name || '',
      data.rating || '',
      data.comment || '',
      data.userId || '',
      data.conversationId || '',
      JSON.stringify(data.chatHistory || []) // Sla chat geschiedenis op als JSON string
    ];
    
    // Append the row
    sheet.appendRow(rowData);
    
    // Return success
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Feedback succesvol opgeslagen'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // Return error
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Er is een fout opgetreden',
      details: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    // Bepaal de actie (getFeedback of downloadCSV)
    var action = e.parameter.action || 'getFeedback';
    var botId = e.parameter.botId;
    
    // Controleer of botId is meegegeven
    if (!botId) {
      throw new Error('Geen bot ID opgegeven');
    }
    
    // Haal de data op uit je spreadsheet
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();
    
    // Definieer de headers (eerste rij van de sheet)
    var headers = [
      'timestamp',
      'botId',
      'name',
      'rating',
      'comment',
      'userId',
      'conversationId',
      'chatHistory'
    ];
    
    // Filter de data op basis van botId (kolom 1 bevat de botId)
    var filteredData = data.filter(function(row, index) {
      if (index === 0) return false; // Skip de header rij
      return String(row[1]).trim() === String(botId).trim();
    });
    
    if (action === 'downloadCSV') {
      // CSV formaat
      var csvContent = [headers.join(',')]; // Begin met headers
      
      // Voeg alleen de gefilterde rijen toe
      filteredData.forEach(function(row) {
        csvContent.push(row.join(','));
      });
      
      return ContentService.createTextOutput(csvContent.join('\n'))
        .setMimeType(ContentService.MimeType.CSV)
        .setDownloadAsFile(`feedback_${botId}_${new Date().toISOString().split('T')[0]}.csv`);
    } else {
      // JSON formaat voor getFeedback
      var jsonData = filteredData.map(function(row) {
        return {
          timestamp: row[0],
          botId: row[1],
          name: row[2] || 'Anoniem',
          rating: parseInt(row[3]) || 0,
          comment: row[4] || '',
          userId: row[5],
          conversationId: row[6],
          chatHistory: row[7] ? JSON.parse(row[7]) : []
        };
      });
      
      return ContentService.createTextOutput(JSON.stringify(jsonData))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Error fetching feedback',
      message: error.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
} 