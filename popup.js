// popup.js

// Global variables to store our content
let originalTitle = "";
let originalMainSummary = "";
let originalKeyPointsHTML = "";
let originalSourceName = "";
let originalContent = ""; // To store the raw extracted content for rewriting

// Get references to all UI elements 
const summarizeBtn = document.getElementById('summarize-page-btn');
const resultDiv = document.getElementById('summary-result');
const translationControls = document.getElementById('translation-controls');
const langSelect = document.getElementById('lang-select');
const translateBtn = document.getElementById('translate-btn');

// Get references to advanced controls
const advancedControls = document.getElementById('advanced-controls');
const rewriteSelect = document.getElementById('rewrite-select');
const rewriteBtn = document.getElementById('rewrite-btn');
const customPromptInput = document.getElementById('custom-prompt-input');
const customPromptBtn = document.getElementById('custom-prompt-btn');


// Main Summarize Button Listener 
summarizeBtn.addEventListener('click', async () => {
  resultDiv.innerHTML = '';
  resultDiv.textContent = 'Starting analysis...';
  resultDiv.classList.add('loading');
  translationControls.style.display = 'none';
  advancedControls.style.display = 'none'; // Hide advanced controls

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
    
    // Store the raw content globally
    originalContent = content;
    
    resultDiv.textContent = 'Generating key points...';

    const keyPointsSummarizer = await Summarizer.create({ 
        type: 'key-points', 
        length: 'long',
        outputLanguage: 'en-US' 
    });
    const rawKeyPointsText = await keyPointsSummarizer.summarize(content);
    
    const keyPointsArray = rawKeyPointsText.split('\n').filter(line => line.trim() !== '');
    
    originalMainSummary = keyPointsArray.map(line => 
        line.replace(/^[\*\-]\s*/, '').trim()
    ).join(' ');

    originalKeyPointsHTML = '<ul>';
    keyPointsArray.forEach(point => {
        const cleanPoint = point.replace(/^[\*\-]\s*/, '').trim();
        originalKeyPointsHTML += `<li>${cleanPoint}</li>`;
    });
    originalKeyPointsHTML += '</ul>';

    originalTitle = title;
    const url = new URL(activeTab.url);
    originalSourceName = url.hostname.replace(/^www\./, '');

    const initialHTML = `<h3>Summary</h3><p><b>${originalTitle}:</b> ${originalMainSummary}</p>
                         <h3>Key Points</h3>${originalKeyPointsHTML}
                         <footer><small>Source: ${originalSourceName}</small></footer>`;
    
    resultDiv.innerHTML = initialHTML;
    translationControls.style.display = 'flex';
    advancedControls.style.display = 'block'; // Show advanced controls
    resultDiv.classList.remove('loading');
    
  } catch (error) {
    console.error("Operation failed:", error);
    resultDiv.classList.remove('loading');
    resultDiv.textContent = `Error: ${error.message}`;
  }
});

// Translate Button Listener
translateBtn.addEventListener('click', async () => {
  resultDiv.innerHTML = '<p><em>Translating...</em></p>';

  try {
    if (!window.Translator) throw new Error('Translator AI is not available.');
    
    const selectedLang = langSelect.value;
    const translator = await Translator.create({ 
      sourceLanguage: 'en', 
      targetLanguage: selectedLang 
    });

    const translatedTitle = await translator.translate(originalTitle);
    const translatedMainSummary = await translator.translate(originalMainSummary);
    
    const parser = new DOMParser();
    const keyPointsDoc = parser.parseFromString(originalKeyPointsHTML, 'text/html');
    const listItems = keyPointsDoc.querySelectorAll('li');
    let numberedKeyPoints = "";
    Array.from(listItems).forEach((item, index) => {
      numberedKeyPoints += `${index + 1}. ${item.innerText}\n`;
    });

    const translatedBlock = await translator.translate(numberedKeyPoints);
    
    let translatedKeyPointsHTML = '<ul>';
    const translatedPoints = translatedBlock.split(/\d+\.\s*/);
    for (let i = 1; i < translatedPoints.length; i++) {
        const cleanPoint = translatedPoints[i].trim();
        if (cleanPoint) {
            translatedKeyPointsHTML += `<li>${cleanPoint}</li>`;
        }
    }
    translatedKeyPointsHTML += '</ul>';

    const finalTranslatedHTML = `<h3>Summary</h3><p><b>${translatedTitle}:</b> ${translatedMainSummary}</p>
                                 <h3>Key Points</h3>${translatedKeyPointsHTML}
                                 <footer><small>Source: ${originalSourceName}</small></footer>`;

    resultDiv.innerHTML = finalTranslatedHTML;

  } catch (error) {
    console.error("Translation failed:", error);
    resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
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
    if (selectedOption === 'simplify') {
      options.length = 'short';
    } else if (selectedOption === 'elaborate') {
      options.length = 'long';
    } else if (selectedOption === 'formal') {
      options.tone = 'formal';
    } else if (selectedOption === 'casual') {
      options.tone = 'casual';
    }


    const rewriter = await Rewriter.create();
    
    const rewrittenText = await rewriter.rewrite(originalContent, options);
    resultDiv.innerHTML = `<h3>Rewritten Text (Style: ${selectedOption})</h3><p>${rewrittenText}</p>`;
    resultDiv.classList.remove('loading');

  } catch (error) {
    console.error("Rewrite failed:", error);
    resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
  }
});

// Custom Prompt Button Listener
customPromptBtn.addEventListener('click', async () => {
  const customPrompt = customPromptInput.value;
  if (!originalContent || !customPrompt) return;

  resultDiv.innerHTML = '<p><em>Running custom prompt...</em></p>';
  resultDiv.classList.add('loading');

  try {
    if (!window.Writer) throw new Error('Writer AI is not available.');

    const writer = await Writer.create();
    
    const fullPrompt = `${customPrompt}:\n\n---\n\n${originalContent}`;
    
    const newText = await writer.write(fullPrompt);

    // Display the new text
    resultDiv.innerHTML = `<h3>Custom Result</h3><p>${newText}</p>`;
    resultDiv.classList.remove('loading');

  } catch (error) {
    console.error("Custom prompt failed:", error);
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