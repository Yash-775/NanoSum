// popup.js

// Global variables
let originalTitle = "";
let originalContent = ""; 
let originalSourceName = "";
let lastEnglishPlainText = ""; 
let selectedLanguage = ''; // Holds the currently selected target language

// Get references to all UI elements
const summarizeBtn = document.getElementById('summary-page-btn');
const resultDiv = document.getElementById('summary-result');
const translationControls = document.getElementById('translation-controls');
const langSelect = document.getElementById('lang-select');
const exportBtn = document.getElementById('export-btn');
const advancedControls = document.getElementById('advanced-controls');
const rewriteSelect = document.getElementById('rewrite-select');
const rewriteBtn = document.getElementById('rewrite-btn');
const proofreadBtn = document.getElementById('proofread-btn');
const writerPromptInput = document.getElementById('writer-prompt-input');
const writerPromptBtn = document.getElementById('writer-prompt-btn');
const promptApiInput = document.getElementById('prompt-api-input');
const promptApiBtn = document.getElementById('prompt-api-btn');

// Converts simple Markdown to HTML
function simpleMarkdownToHtml(text) {
    if (!text) return "";
    let html = text
        .replace(/^## (.*)$/gm, '<h3>$1</h3>')
        .replace(/^### (.*)$/gm, '<h4>$1</h4>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^[\*\-]\s(.*)$/gm, '<li>$1</li>'); 

    html = html.replace(/<\/li>\n<li>/g, '</li><li>'); 
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    html = html.replace(/<\/ul>(\s*<br\s*\/?>\s*)?<ul>/g, ''); 
    
    html = html.split('</ul>').map(part => {
        if (part.includes('<ul>')) return part;
        return part.replace(/\n/g, '<br>');
    }).join('</ul>');
    
    return html.replace(/<br>\s*<ul>/g, '<ul>').replace(/<\/ul>\s*<br>/g, '</ul>');
}

// Listener for Language Dropdown Change
langSelect.addEventListener('change', async () => {
    selectedLanguage = langSelect.value;
    if (lastEnglishPlainText && !resultDiv.querySelector('footer')) {
        let title = "Result";
        if (resultDiv.querySelector('h3')) {
            title = resultDiv.querySelector('h3').innerText.replace(/ \([A-Z]{2}\)$/, '');
        }
        await displaySimpleText(lastEnglishPlainText, title);
    } else if (lastEnglishPlainText && resultDiv.querySelector('footer')) {
        await summarizeBtn.click();
    }
});

// Helper Function for simple (non-summary) text
async function displaySimpleText(englishText, resultTitle = "Result") {
    lastEnglishPlainText = englishText;

    if (selectedLanguage && selectedLanguage !== 'en' && selectedLanguage !== '') {
        resultDiv.innerHTML = `<p><em>Translating to ${langSelect.options[langSelect.selectedIndex].text}...</em></p>`;
        resultDiv.style.display = 'flex';
        resultDiv.classList.add('loading');
        try {
            if (!window.Translator) throw new Error('Translator AI is not available.');
            const translator = await Translator.create({
                sourceLanguage: 'en',
                targetLanguage: selectedLanguage
            });
            const translatedText = await translator.translate(englishText);
            
            // Convert the translated text to HTML
            const formattedHtml = simpleMarkdownToHtml(translatedText);
            
            resultDiv.innerHTML = `<h3>${resultTitle} (${selectedLanguage.toUpperCase()})</h3>${formattedHtml}`;
            resultDiv.style.display = 'block'; // Show as block for final content
            resultDiv.classList.remove('loading');
        } catch (error) {
            console.error("Auto-translation failed:", error);
            resultDiv.style.display = 'block';
            resultDiv.classList.remove('loading');
            resultDiv.innerHTML = `<p style="color: red;">Translation Error: ${error.message}</p><p>Showing English:</p><h3>${resultTitle}</h3>${simpleMarkdownToHtml(englishText)}`;
        }
    } else {
        // Convert the English text to HTML
        const formattedHtml = simpleMarkdownToHtml(englishText);
        resultDiv.innerHTML = `<h3>${resultTitle}</h3>${formattedHtml}`;
        resultDiv.style.display = 'block'; // Show as block for final content
        resultDiv.classList.remove('loading');
    }
}


// Main Summarize Button Listener
summarizeBtn.addEventListener('click', async () => {
    resultDiv.style.display = 'flex';
    resultDiv.innerHTML = ''; // Clear placeholder text
    resultDiv.textContent = 'Starting analysis...';
    resultDiv.classList.add('loading');
    
    translationControls.style.display = 'none';
    advancedControls.style.display = 'none';

    try {
        if (!window.Summarizer) throw new Error('Summarizer AI is not available.');

        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        const url = new URL(activeTab.url);
        originalSourceName = url.hostname.replace(/^www\./, '');
        
        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: smartContentExtractor, // Using the 30k extractor
        });

        const { title, content } = injectionResults[0].result;
        if (!content || content.trim().length < 100) {
            throw new Error("Could not extract enough meaningful content.");
        }

        originalContent = content; // This is the full 30k chars for Prompt API
        originalTitle = title;
        resultDiv.textContent = 'Generating summary...';

        const summaryContent = originalContent.substring(0, 10000); // Safe length for Summarizer

        const summarizer = await Summarizer.create({ 
            type: 'tldr', 
            length: 'medium', 
            outputLanguage: 'en-US' 
        });
        const mainSummary = await summarizer.summarize(summaryContent);

        resultDiv.textContent = 'Generating key points...';

        const keyPointsSummarizer = await Summarizer.create({
            type: 'key-points',
            length: 'long',
            outputLanguage: 'en-US'
        });
        const rawKeyPointsText = await keyPointsSummarizer.summarize(summaryContent);

        // Build the plain text for translation 
        const keyPointsArray = rawKeyPointsText.split('\n').filter(line => line.trim() !== '');
        let plainKeyPoints = keyPointsArray.map(line => line.replace(/^[\*\-]\s?/, '').trim()).join('\n- ');
        lastEnglishPlainText = `Summary\n${originalTitle}: ${mainSummary}\n\nKey Points:\n- ${plainKeyPoints}\n\nSource: ${originalSourceName}`;
        
        // Translate if needed 
        let finalTitle = originalTitle;
        let finalMainSummary = mainSummary;
        let finalSourceName = originalSourceName; 
        let titleSuffix = "";
        
        // This array will hold our key points, translated or not.
        let finalKeyPointsArray = keyPointsArray; 

        if (selectedLanguage && selectedLanguage !== 'en' && selectedLanguage !== '') {
            resultDiv.textContent = 'Translating...';
            if (!window.Translator) throw new Error('Translator AI is not available.');
            const translator = await Translator.create({ sourceLanguage: 'en', targetLanguage: selectedLanguage });
            
            // Translate the main parts
            finalTitle = await translator.translate(originalTitle);
            finalMainSummary = await translator.translate(mainSummary);
            finalSourceName = await translator.translate(originalSourceName);
            titleSuffix = ` (${selectedLanguage.toUpperCase()})`;

            // Translate each key point individually for reliability
            const translatedPoints = [];
            for (const point of keyPointsArray) {
                // We clean the bullet point *before* sending it
                const cleanPoint = point.replace(/^[\*\-]\s?/, '').trim();
                if (cleanPoint) {
                    const translatedPoint = await translator.translate(cleanPoint);
                    translatedPoints.push(translatedPoint);
                }
            }
            finalKeyPointsArray = translatedPoints; // Use the new translated array
        }

        // Build the final HTML
        // This loop now runs on the *correct* array (either original or translated)
        let keyPointsHTML = '<ul>';
        finalKeyPointsArray.forEach(point => {
            // Text is already clean, just wrap it
            keyPointsHTML += `<li>${point}</li>`;
        });
        keyPointsHTML += '</ul>';

        const finalHTML = `<h3>Summary & Key Points${titleSuffix}</h3><p><b>${finalTitle}:</b> ${finalMainSummary}</p>
                         <h3>Key Points</h3>${keyPointsHTML}
                         <footer><small>Source: ${finalSourceName}</small></footer>`;
        
        resultDiv.innerHTML = finalHTML;
        resultDiv.style.display = 'block';
        resultDiv.classList.remove('loading');
        resultDiv.style.fontStyle = 'normal';
        resultDiv.style.color = '#202124';

        translationControls.style.display = 'flex';
        advancedControls.style.display = 'block';

    } catch (error) {
        console.error("Operation failed:", error);
        resultDiv.style.display = 'block';
        resultDiv.classList.remove('loading');
        resultDiv.textContent = `Error: ${error.message}`;
    }
});

// Rewrite Button Listener 
rewriteBtn.addEventListener('click', async () => {
    if (!originalContent) return;
    resultDiv.innerHTML = '<p><em>Rewriting...</em></p>';
    resultDiv.style.display = 'flex';
    resultDiv.classList.add('loading');

    try {
        if (!window.Rewriter) throw new Error('Rewriter AI is not available.');

        const selectedOption = rewriteSelect.value;
        let options = {};
        if (selectedOption === 'simplify') {
            options.length = 'short';
            options.context = "Rewrite this text to be simpler, easy to understand, and in less than 200 words.";
        } else if (selectedOption === 'elaborate') {
            options.length = 'long';
            options.context = "Rewrite this text to be more detailed and elaborate.";
        } else if (selectedOption === 'formal') {
            options.tone = 'formal';
            options.context = "Rewrite this text in a formal, professional tone.";
        } else if (selectedOption === 'casual') {
            options.tone = 'casual';
            options.context = "Rewrite this text in a casual, friendly tone, and keep it under 200 words.";
        }

        // Create a shorter, "safe" version for the API
        const safeContent = originalContent.substring(0, 10000);

        const rewriter = await Rewriter.create();
        const rewrittenText = await rewriter.rewrite(safeContent, options);

        // Use the new display function
        await displaySimpleText(rewrittenText, `Rewritten Text (Style: ${selectedOption})`);

    } catch (error) {
        console.error("Rewrite failed:", error);
        resultDiv.style.display = 'block';
        resultDiv.classList.remove('loading');
        resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
});

// Writer (Creative) Button Listener
writerPromptBtn.addEventListener('click', async () => {
    let customPrompt = writerPromptInput.value;
    if (!originalTitle || !customPrompt) return;
    resultDiv.innerHTML = '<p><em>Proofreading your prompt...</em></p>';
    resultDiv.style.display = 'flex';
    resultDiv.classList.add('loading');

    try {
        if (!window.Proofreader) throw new Error('Proofreader AI is not available.');
        const proofreader = await Proofreader.create({ expectedInputLanguages: ['en'] });
        const proofreadResult = await proofreader.proofread(customPrompt);
        const correctedPrompt = proofreadResult.correctedInput;

        if (typeof correctedPrompt === 'undefined') {
            writerPromptInput.value = customPrompt;
            resultDiv.innerHTML = '<p><em>Proofread failed. Running writer...</em></p>';
        } else {
            writerPromptInput.value = correctedPrompt;
            resultDiv.innerHTML = '<p><em>Running writer with corrected prompt...</em></p>';
        }

        if (!window.Writer) throw new Error('Writer AI is not available.');
        const writer = await Writer.create({ outputLanguage: 'en' });
        const fullPrompt = `${writerPromptInput.value}: ${originalTitle}`; 
        const newText = await writer.write(fullPrompt);

        // Use the new display function
        await displaySimpleText(newText, "Writer Result");

    } catch (error) {
        console.error("Writer prompt failed:", error);
        resultDiv.style.display = 'block';
        resultDiv.classList.remove('loading');
        resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
});

// Proofread Button Listener 
proofreadBtn.addEventListener('click', async () => {
    if (!originalContent) return;
    resultDiv.innerHTML = '<p><em>Proofreading content...</em></p>';
    resultDiv.style.display = 'flex';
    resultDiv.classList.add('loading');

    try {
        if (!window.Proofreader) throw new Error('Proofreader AI is not available.');

        // Create a shorter, "safe" version for the API
        const safeContent = originalContent.substring(0, 7000); // 7k is a safer limit

        const proofreader = await Proofreader.create({ expectedInputLanguages: ['en'] });
        const resultObject = await proofreader.proofread(safeContent);
        const correctedText = resultObject.correctedInput;

        // Use the new display function
        await displaySimpleText(correctedText, "Proofread Text");

    } catch (error) {
        console.error("Proofread failed:", error);
        resultDiv.style.display = 'block';
        resultDiv.classList.remove('loading');
        resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`; // Fixed the typo
    }
});

// Prompt API Button Listener (Text-Only) ---
promptApiBtn.addEventListener('click', async () => {
    let userPrompt = promptApiInput.value;
    if (!originalContent || !userPrompt) return;
    resultDiv.innerHTML = '<p><em>Proofreading your prompt...</em></p>';
    resultDiv.style.display = 'flex';
    resultDiv.classList.add('loading');

    try {
        if (!window.Proofreader) throw new Error('Proofreader AI is not available.');
        const proofreader = await Proofreader.create({ expectedInputLanguages: ['en'] });
        const proofreadResult = await proofreader.proofread(userPrompt);
        const correctedPrompt = proofreadResult.correctedInput;

        if (typeof correctedPrompt === 'undefined') { // Fixed typo here
            promptApiInput.value = userPrompt;
            resultDiv.innerHTML = '<p><em>Proofread failed. Running prompt...</em></p>';
        } else {
            promptApiInput.value = correctedPrompt;
            resultDiv.innerHTML = '<p><em>Running prompt with corrected text...</em></p>';
        }

        if (!window.LanguageModel) {
            throw new Error("Base Prompt API (LanguageModel) is not available.");
        }

        const session = await LanguageModel.create({
            expectedInputs: [{ type: "text", languages: ["en", "en"] }],
            expectedOutputs: [{ type: "text", languages: ["en"] }]
        });
        
        // This correctly uses the full 'originalContent' to find the answer
        const fullPrompt = `Based on the following content, answer this question: "${promptApiInput.value}"\n\n--- CONTENT ---\n${originalContent}`;
        const result = await session.prompt(fullPrompt);

        // Use the new display function
        await displaySimpleText(result, "Prompt Result");

    } catch (error) {
        console.error("Prompt API failed:", error);
        resultDiv.style.display = 'block';
        resultDiv.classList.remove('loading');
        resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
});

// Content Extractor Function
// This is the correct 30k extractor for the Prompt API
function smartContentExtractor() {
    const h1 = document.querySelector('h1');
    let pageTitle = h1 ? h1.innerText.trim() : document.title;
    let content = "";

    const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
    const paragraphs = mainContent.querySelectorAll('p');
    
    for (let i = 0; i < paragraphs.length; i++) {
        const pText = paragraphs[i].innerText.trim();
        if (pText.length > 100) { 
            content += `${pText}\n\n`;
        }
    }
    
    return { title: pageTitle, content: content.substring(0, 30000) };
}

// Export to Notes Button Listener
exportBtn.addEventListener('click', () => {
    if (!lastEnglishPlainText) {
        console.warn("No text to export.");
        resultDiv.innerHTML = `<p style="color: red; font-style: normal; text-align: center;">Please generate a summary before exporting.</p>`;
        return;
    }

    const blob = new Blob([lastEnglishPlainText], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    
    const date = new Date();
    const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
    a.download = `NanoSum_Note_${timestamp}.txt`;
    
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
});