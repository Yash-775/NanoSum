// popup.js

// Global variables
let originalTitle = "";
let originalContent = "";
let originalSourceName = "";
// Holds the last-generated ENGLISH plain text
let lastEnglishPlainText = "";
// Holds the currently selected target language ('', 'en', 'es', etc.)
let selectedLanguage = '';

// Get references to all UI elements 
const summarizeBtn = document.getElementById('summary-page-btn');
const resultDiv = document.getElementById('summary-result');
const translationControls = document.getElementById('translation-controls');
const langSelect = document.getElementById('lang-select');
const advancedControls = document.getElementById('advanced-controls');
const rewriteSelect = document.getElementById('rewrite-select');
const rewriteBtn = document.getElementById('rewrite-btn');
const proofreadBtn = document.getElementById('proofread-btn');
const writerPromptInput = document.getElementById('writer-prompt-input');
const writerPromptBtn = document.getElementById('writer-prompt-btn');
const promptApiInput = document.getElementById('prompt-api-input');
const promptApiBtn = document.getElementById('prompt-api-btn');

// Listener for Language Dropdown Change
langSelect.addEventListener('change', async () => {
    selectedLanguage = langSelect.value;
    // Re-translate and display the last generated English text
    if (lastEnglishPlainText) {
        // Find the title associated with the last generated text
        let title = "Result"; // Default title
        if (resultDiv.querySelector('h3')) {
            title = resultDiv.querySelector('h3').innerText.replace(/ \([A-Z]{2}\)$/, ''); // Remove language code if present
        }
        await displayTranslatedText(lastEnglishPlainText, title);
    }
});

// Helper Function for Auto-Translation
async function displayTranslatedText(englishText, resultTitle = "Result") {
    // Update the source of truth
    lastEnglishPlainText = englishText;

    // Check if translation is needed
    if (selectedLanguage && selectedLanguage !== 'en' && selectedLanguage !== '') {
        resultDiv.innerHTML = `<p><em>Translating to ${langSelect.options[langSelect.selectedIndex].text}...</em></p>`;
        resultDiv.classList.add('loading');
        try {
            if (!window.Translator) throw new Error('Translator AI is not available.');
            const translator = await Translator.create({
                sourceLanguage: 'en',
                targetLanguage: selectedLanguage
            });
            const translatedText = await translator.translate(englishText);
            // Display translated text, adding language code to title
            resultDiv.innerHTML = `<h3>${resultTitle} (${selectedLanguage.toUpperCase()})</h3><p style="white-space: pre-wrap;">${translatedText}</p>`;
            resultDiv.classList.remove('loading');
        } catch (error) {
            console.error("Auto-translation failed:", error);
            resultDiv.classList.remove('loading');
            // Show error and fall back to English
            resultDiv.innerHTML = `<p style="color: red;">Translation Error: ${error.message}</p><p>Showing English:</p><h3>${resultTitle}</h3><p style="white-space: pre-wrap;">${englishText}</p>`;
        }
    } else {
        // If English or default is selected, just display the English text
        // Use pre-wrap to respect newlines in the plain text
        resultDiv.innerHTML = `<h3>${resultTitle}</h3><p style="white-space: pre-wrap;">${englishText}</p>`;
        resultDiv.classList.remove('loading');
    }
}


// Main Summarize Button Listener
summarizeBtn.addEventListener('click', async () => {
    resultDiv.innerHTML = '';
    resultDiv.textContent = 'Starting analysis...';
    resultDiv.classList.add('loading');
    translationControls.style.display = 'none';
    advancedControls.style.display = 'none';

    try {
        if (!window.Summarizer) throw new Error('Summarizer AI is not available.');

        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: smartContentExtractor,
        });

        const { title, content } = injectionResults[0].result;
        if (!content || content.trim().length < 100) {
            throw new Error("Could not extract enough meaningful content.");
        }

        originalContent = content;
        originalTitle = title;
        resultDiv.textContent = 'Generating key points...';

        const keyPointsSummarizer = await Summarizer.create({
            type: 'key-points',
            length: 'long',
            outputLanguage: 'en-US'
        });
        const rawKeyPointsText = await keyPointsSummarizer.summarize(content);

        const keyPointsArray = rawKeyPointsText.split('\n').filter(line => line.trim() !== '');

        const mainSummary = keyPointsArray.map(line =>
            line.replace(/^[\*\-]\s*/, '').trim()
        ).join(' ');

        const url = new URL(activeTab.url);
        originalSourceName = url.hostname.replace(/^www\./, '');

        // Construct the plain English text for translation state
        const englishSummaryText = `Summary\n${originalTitle}: ${mainSummary}\n\nKey Points:\n${keyPointsArray.join('\n')}\n\nSource: ${originalSourceName}`;

        // Call the helper to display (and maybe translate)
        await displayTranslatedText(englishSummaryText, "Summary & Key Points");

        translationControls.style.display = 'flex';
        advancedControls.style.display = 'block';

    } catch (error) {
        console.error("Operation failed:", error);
        resultDiv.classList.remove('loading');
        resultDiv.textContent = `Error: ${error.message}`;
    }
});

// Rewrite Button Listener
rewriteBtn.addEventListener('click', async () => {
    if (!originalContent) return;
    resultDiv.innerHTML = '<p><em>Rewriting...</em></p>';
    resultDiv.classList.add('loading');

    try {
        if (!window.Rewriter) throw new Error('Rewriter AI is not available.');

        const selectedOption = rewriteSelect.value;
        let options = {};
        if (selectedOption === 'simplify') options.length = 'short';
        else if (selectedOption === 'elaborate') options.length = 'long';
        else if (selectedOption === 'formal') options.tone = 'formal';
        else if (selectedOption === 'casual') options.tone = 'casual';

        const rewriter = await Rewriter.create();
        const rewrittenText = await rewriter.rewrite(originalContent, options);

        // Call helper to display (and maybe translate)
        await displayTranslatedText(rewrittenText, `Rewritten Text (Style: ${selectedOption})`);

    } catch (error) {
        console.error("Rewrite failed:", error);
        resultDiv.classList.remove('loading'); // Ensure loading removed on error
        resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
});

// Writer (Creative) Button Listener
writerPromptBtn.addEventListener('click', async () => {
    let customPrompt = writerPromptInput.value;
    if (!originalTitle || !customPrompt) return;
    resultDiv.innerHTML = '<p><em>Proofreading your prompt...</em></p>';
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

        // Call helper to display (and maybe translate)
        await displayTranslatedText(newText, "Writer Result");

    } catch (error) {
        console.error("Writer prompt failed:", error);
        resultDiv.classList.remove('loading'); // Ensure loading removed on error
        resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
});

// Proofread Button Listener
proofreadBtn.addEventListener('click', async () => {
    if (!originalContent) return;
    resultDiv.innerHTML = '<p><em>Proofreading content...</em></p>';
    resultDiv.classList.add('loading');

    try {
        if (!window.Proofreader) throw new Error('Proofreader AI is not available.');
        const proofreader = await Proofreader.create({ expectedInputLanguages: ['en'] });
        const resultObject = await proofreader.proofread(originalContent);
        const correctedText = resultObject.correctedInput;

        // Call helper to display (and maybe translate)
        await displayTranslatedText(correctedText, "Proofread Text");

    } catch (error) {
        console.error("Proofread failed:", error);
        resultDiv.classList.remove('loading'); // Ensure loading removed on error
        resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</I>`;
    }
});

// Prompt API Button Listener
promptApiBtn.addEventListener('click', async () => {
    let userPrompt = promptApiInput.value;
    if (!originalContent || !userPrompt) return;
    resultDiv.innerHTML = '<p><em>Proofreading your prompt...</em></p>';
    resultDiv.classList.add('loading');

    try {
        if (!window.Proofreader) throw new Error('Proofreader AI is not available.');
        const proofreader = await Proofreader.create({ expectedInputLanguages: ['en'] });
        const proofreadResult = await proofreader.proofread(userPrompt);
        const correctedPrompt = proofreadResult.correctedInput;

        if (typeof correctedPrompt === 'undefined') {
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

        const fullPrompt = `Based on the following content, answer this question: "${promptApiInput.value}"\n\n--- CONTENT ---\n${originalContent}`;
        const result = await session.prompt(fullPrompt);

        // Call helper to display (and maybe translate)
        await displayTranslatedText(result, "Prompt Result");

    } catch (error) {
        console.error("Prompt API failed:", error);
        resultDiv.classList.remove('loading'); // Ensure loading removed on error
        resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
});

// Content Extractor Function
function smartContentExtractor() {
    const h1 = document.querySelector('h1');
    let pageTitle = h1 ? h1.innerText.trim() : document.title;
    let content = "";
    let paragraphsAdded = 0;

    if (h1) {
        let currentNode = h1;
        while (currentNode && paragraphsAdded < 4) {
            currentNode = currentNode.nextElementSibling;
            if (currentNode && currentNode.tagName === 'P') {
                const pText = currentNode.innerText.trim();
                if (pText.length > 100) {
                    content += pText + "\n\n";
                    paragraphsAdded++;
                }
            }
        }
    }

    if (content.length < 100) {
        const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
        const paragraphs = mainContent.querySelectorAll('p');
        for (let i = 0; i < paragraphs.length && paragraphsAdded < 5; i++) {
            const pText = paragraphs[i].innerText.trim();
            if (pText.length > 150) {
                content += `${pText}\n\n`;
                paragraphsAdded++;
            }
        }
    }

    return { title: pageTitle, content: content.substring(0, 10000) };
}