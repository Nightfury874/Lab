/* JSONViewer/diffCheck/engine.js */

function updateLineCount(textareaId, countId) {
    const textarea = document.getElementById(textareaId);
    const countSpan = document.getElementById(countId);
    const lines = textarea.value.split('\n').length;
    countSpan.textContent = `Lines: ${lines}`;


    // Update line numbers
    const lineNumbers = document.getElementById(textareaId === 'textInput1' ? 'lineNumbers1' : 'lineNumbers2');
    lineNumbers.innerHTML = '';
    for (let i = 1; i <= lines; i++) {
        const lineDiv = document.createElement('div');
        lineDiv.textContent = i;
        lineNumbers.appendChild(lineDiv);
    console.log('Line Numbers:', lineNumbers); // Debugging line    
    }
}

function compareTexts() {
    const text1 = document.getElementById('textInput1').value;
    const text2 = document.getElementById('textInput2').value;

    if (text1.trim() === "" || text2.trim() === "") {
        alert("Both text areas must be filled to perform a comparison.");
        return;
    }

    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');

    const diffs = getDiff(lines1, lines2);

    // Initialize counts
    let additions1 = 0, deletions1 = 0;
    let additions2 = 0, deletions2 = 0;

    let compareHTML1 = '';
    let compareHTML2 = '';

    diffs.forEach(diff => {
        switch (diff.type) {
            case 'equal':
                compareHTML1 += `<div><span class="line-number">${diff.lineNumber1}</span><span class="line-text">${escapeHTML(diff.line1)}</span></div>`;
                compareHTML2 += `<div><span class="line-number">${diff.lineNumber2}</span><span class="line-text">${escapeHTML(diff.line2)}</span></div>`;
                break;
            case 'delete':
                deletions1++;
                compareHTML1 += `<div><span class="line-number">${diff.lineNumber1}</span><span class="line-text deletion">${escapeHTML(diff.line1)}</span></div>`;
                compareHTML2 += `<div><span class="line-number"></span><span class="line-text"></span></div>`;
                break;
            case 'insert':
                additions2++;
                compareHTML1 += `<div><span class="line-number"></span><span class="line-text"></span></div>`;
                compareHTML2 += `<div><span class="line-number">${diff.lineNumber2}</span><span class="line-text addition">${escapeHTML(diff.line2)}</span></div>`;
                break;
            case 'replace':
                deletions1++;
                additions2++;

                // Perform word-level diff
                const wordDiff = getWordDiff(diff.line1, diff.line2);

                // Wrap specific deletions in Text 1 Viewer
                const highlightedLine1 = wordDiff.deletions.length > 0 ? wrapDeletions(diff.line1, wordDiff.deletions) : escapeHTML(diff.line1);

                // Wrap specific additions in Text 2 Viewer
                const highlightedLine2 = wordDiff.additions.length > 0 ? wrapAdditions(diff.line2, wordDiff.additions) : escapeHTML(diff.line2);

                // Highlight entire lines
                compareHTML1 += `<div><span class="line-number">${diff.lineNumber1}</span><span class="line-text deletion">${highlightedLine1}</span></div>`;
                compareHTML2 += `<div><span class="line-number">${diff.lineNumber2}</span><span class="line-text addition">${highlightedLine2}</span></div>`;
                break;
            case 'gap':
                compareHTML1 += `<div class="line-gap"></div>`;
                compareHTML2 += `<div class="line-gap"></div>`;
                break;
            default:
                break;
        }
        console.log('Compare HTML1:', compareHTML1); // Debugging line
    });

    // Update Compare Viewers
    const diffContent1 = document.getElementById('diffContent1');
    const diffContent2 = document.getElementById('diffContent2');

    diffContent1.innerHTML = compareHTML1;
    diffContent2.innerHTML = compareHTML2;

    // Update addition and deletion counts
    document.getElementById('additions1').textContent = `Additions: 0`;
    document.getElementById('deletions1').textContent = `Deletions: ${deletions1}`;
    document.getElementById('additions2').textContent = `Additions: ${additions2}`;
    document.getElementById('deletions2').textContent = `Deletions: 0`;

    // Show Compare Viewers
    document.getElementById('compareView1').style.display = 'block';
    document.getElementById('compareView2').style.display = 'block';
    console.log('Compare Viewers:', document.getElementById('compareView1')); // Debugging line

    // Scroll to the first Compare Viewer
    document.getElementById('compareView1').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Implements a simple Diff algorithm based on the Longest Common Subsequence (LCS).
 * Returns an array of diff objects indicating the type of difference.
 */
function getDiff(a, b) {
    const lcs = computeLCS(a, b);
    const diffs = [];
    let i = 0, j = 0;

    lcs.forEach(element => {
        while (a[i] !== element && i < a.length) {
            diffs.push({ type: 'delete', line1: a[i], lineNumber1: i + 1 });
            i++;
        }
        while (b[j] !== element && j < b.length) {
            diffs.push({ type: 'insert', line2: b[j], lineNumber2: j + 1 });
            j++;
        }
        if (a[i] === element && b[j] === element) {
            diffs.push({ type: 'equal', line1: a[i], line2: b[j], lineNumber1: i + 1, lineNumber2: j + 1 });
            i++;
            j++;
        }
    });

    // Handle remaining lines
    while (i < a.length) {
        diffs.push({ type: 'delete', line1: a[i], lineNumber1: i + 1 });
        i++;
    }
    while (j < b.length) {
        diffs.push({ type: 'insert', line2: b[j], lineNumber2: j + 1 });
        j++;
    }

    console.log('Diffs:', diffs); // Debugging line
    return diffs;
   
}

/**
 * Determines if two lines are similar based on a similarity threshold.
 * Returns true if similarity >= threshold, else false.
 */
function areLinesSimilar(lineA, lineB, threshold = 0.6) {
    const distance = levenshteinDistance(lineA, lineB);
    const maxLength = Math.max(lineA.length, lineB.length);
    const similarity = (maxLength - distance) / maxLength;
    return similarity >= threshold;
}

/**
 * Computes the Levenshtein Distance between two strings.
 */
function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            if (a[i - 1] === b[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
            }
        }
    }
    console.log('length:', matrix[a.length]); // Debugging line
    return matrix[a.length][b.length];

}




/**
 * Computes the Longest Common Subsequence (LCS) between two arrays.
 */
function computeLCS(a, b, similarityThreshold = 0.6) {
    const matrix = [];
    for (let i = 0; i <= a.length; i++) {
        matrix[i] = [];
        for (let j = 0; j <= b.length; j++) {
            if (i === 0 || j === 0) {
                matrix[i][j] = 0;
            } else if (areLinesSimilar(a[i - 1], b[j - 1], similarityThreshold)) {
                matrix[i][j] = matrix[i - 1][j - 1] + 1;
            } else {
                matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
            }
        }
    }

    // Backtrack to find LCS
    const lcs = [];
    let i = a.length;
    let j = b.length;
    while (i > 0 && j > 0) {
        if (areLinesSimilar(a[i - 1], b[j - 1], similarityThreshold)) {
            lcs.unshift(a[i - 1]);
            i--;
            j--;
        } else if (matrix[i - 1][j] > matrix[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    console.log('LCS:', lcs); // Debugging line
    return lcs;
}

/**
 * Escapes HTML characters to prevent rendering issues.
 */
function escapeHTML(str) {
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
}

/**
 * Performs a simple word-level diff between two lines.
 * Returns an object containing arrays of deleted and added words.
 */
function getWordDiff(line1, line2) {
    const words1 = line1.split(' ');
    const words2 = line2.split(' ');
    const lcs = computeLCS(words1, words2);
    const deletions = [];
    const additions = [];

    let i = 0, j = 0;

    lcs.forEach(word => {
        while (words1[i] !== word && i < words1.length) {
            deletions.push(words1[i]);
            i++;
        }
        while (words2[j] !== word && j < words2.length) {
            additions.push(words2[j]);
            j++;
        }
        if (words1[i] === word && words2[j] === word) {
            i++;
            j++;
        }
    });

    // Handle remaining words
    while (i < words1.length) {
        deletions.push(words1[i]);
        i++;
    }
    while (j < words2.length) {
        additions.push(words2[j]);
        j++;
    }

    console.log('Word Diff:', { deletions, additions }); // Debugging line
    return { deletions, additions };
}

/**
 * Wraps deleted words with a span for styling in Text 1 Viewer.
 */
function wrapDeletions(line, deletions) {
    if (deletions.length === 0) return escapeHTML(line);
    const regex = new RegExp(`(${additions.map(word => escapeRegExp(word)).join('|')})`, 'g');
    console.log('Regex:', regex); // Debugging line
    console.log('Escaped Line:', escapeHTML(line)); // Debugging line
    return escapeHTML(line).replace(regex, '<span class="bright-deletion">$1</span>');
}

/**
 * Wraps added words with a span for styling in Text 2 Viewer.
 */
function wrapAdditions(line, additions) {
    if (additions.length === 0) return escapeHTML(line);
    const regex = new RegExp(`(${additions.map(word => escapeRegExp(word)).join('|')})`, 'g');
    return escapeHTML(line).replace(regex, '<span class="bright-addition">$1</span>');
}

/**
 * Escapes special characters in a string for use in a regular expression.
 */
function escapeHTML(str) {
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}
