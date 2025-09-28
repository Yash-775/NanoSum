// popup.js (DEFINITIVE FINAL VERSION)

document.getElementById('summarize-btn').addEventListener('click', async () => {
  const resultDiv = document.getElementById('summary-result');
  resultDiv.textContent = 'Starting summarization...';
  resultDiv.classList.add('loading');

  try {
    // Step 1: Check for the global Summarizer object.
    if (!window.Summarizer) {
      throw new Error('Built-in AI (Summarizer) is not available. Check Chrome version/flags.');
    }

    // Step 2: Get ONLY the main title from the active web page.
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: titleExtractor, // <-- Using our new, super-concise extractor
    });
    
    const pageTitle = injectionResults[0].result;
    if (!pageTitle || pageTitle.trim() === '') {
        throw new Error("Could not extract a title from the page.");
    }
    resultDiv.textContent = `Topic extracted: "${pageTitle}". Calling AI...`;

    // Step 3: Create the Summarizer using the EXACT options from your successful test.
    const summarizerOptions = {
      type: 'tldr',
      length: 'short',
      format: 'plain-text',
      outputLanguage: 'en-US'
    };
    
    const summarizer = await Summarizer.create(summarizerOptions);

    // Step 4: Run the summarization on the page title.
    resultDiv.textContent = 'Model is ready. Summarizing topic...';
    const summaryResult = await summarizer.summarize(pageTitle);

    // Step 5: Display the final result.
    resultDiv.classList.remove('loading');
    resultDiv.textContent = summaryResult; // The result is a direct string now with these options

  } catch (error) {
    console.error("Summarization failed:", error);
    resultDiv.classList.remove('loading');
    resultDiv.textContent = `Error: ${error.message}`;
  }
});

// This new function just gets the main H1 title, or the document title as a fallback.
function titleExtractor() {
  const h1 = document.querySelector('h1');
  if (h1 && h1.innerText) {
    return h1.innerText.trim();
  }
  // If no H1 is found, use the page's main title
  return document.title;
}