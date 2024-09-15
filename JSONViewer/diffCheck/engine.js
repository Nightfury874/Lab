/* engine.js */

// Variables to hold CodeMirror instances
let editor1, editor2;

// Initialize CodeMirror instances after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize CodeMirror for Text Input 1
    editor1 = CodeMirror.fromTextArea(document.getElementById('textInput1'), {
        lineNumbers: true,
        mode: "text/plain",
        theme: "material",
        readOnly: false,
        lineWrapping: true,
    });

    // Initialize CodeMirror for Text Input 2
    editor2 = CodeMirror.fromTextArea(document.getElementById('textInput2'), {
        lineNumbers: true,
        mode: "text/plain",
        theme: "material",
        readOnly: false,
        lineWrapping: true,
    });
});

/* Function to copy text from a specified editor */
function copyText(textareaId) {
    let editor;

    if (textareaId === 'textInput1') {
        editor = editor1;
    } else if (textareaId === 'textInput2') {
        editor = editor2;
    } else {
        alert("Invalid textarea ID.");
        return;
    }

    const text = editor.getValue().trim();

    if (text === "") {
        alert("There is no text to copy.");
        return;
    }

    // Use the Clipboard API for modern browsers
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            alert("Text copied to clipboard!");
        }).catch(err => {
            console.error("Failed to copy: ", err);
            alert("Failed to copy text.");
        });
    } else {
        // Fallback method using a temporary textarea
        const tempTextarea = document.createElement('textarea');
        tempTextarea.value = text;
        // Make the textarea out of viewport
        tempTextarea.style.position = 'absolute';
        tempTextarea.style.left = '-9999px';
        document.body.appendChild(tempTextarea);
        tempTextarea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                alert("Text copied to clipboard!");
            } else {
                alert("Failed to copy text.");
            }
        } catch (err) {
            console.error("Fallback: Oops, unable to copy", err);
            alert("Failed to copy text.");
        }

        document.body.removeChild(tempTextarea);
    }
}

/* Function to toggle the expansion of text boxes */
function toggleExpand(boxId) {
    const box = document.getElementById(boxId);

    if (box.classList.contains('expanded')) {
        box.classList.remove('expanded');
    } else {
        box.classList.add('expanded');
    }

    // Optionally, collapse the other box if needed
    if (boxId === 'textBox1') {
        const otherBox = document.getElementById('textBox2');
        otherBox.classList.remove('expanded');
    } else if (boxId === 'textBox2') {
        const otherBox = document.getElementById('textBox1');
        otherBox.classList.remove('expanded');
    }

    // Hide the diffContainer when toggling expansion
    const diffContainer = document.getElementById('diffContainer');
    if (diffContainer) {
        diffContainer.classList.add('hidden');

        // Reset summary counts
        document.getElementById('linesAdded').textContent = '0';
        document.getElementById('linesDeleted').textContent = '0';
    }
}

/* Function to compare texts using CodeMirror's MergeView */
function compareText() {
    const text1 = editor1.getValue().trim();
    const text2 = editor2.getValue().trim();
    const diffView = document.getElementById('diffView');
    const diffContainer = document.getElementById('diffContainer');

    if (text1 === "" || text2 === "") {
        alert("Both text inputs must be filled to perform a comparison.");
        return;
    }

    try {
        // Clear previous MergeView instances by resetting innerHTML
        diffView.innerHTML = '';

        // Compute diffs using diff_match_patch
        const dmp = new diff_match_patch();
        const diffs = dmp.diff_main(text1, text2);
        dmp.diff_cleanupSemantic(diffs);

        // Count lines added and deleted
        let linesAdded = 0;
        let linesDeleted = 0;
        diffs.forEach(part => {
            if (part[0] === 1) { // Insertion
                linesAdded += part[1].split('\n').length - 1;
            } else if (part[0] === -1) { // Deletion
                linesDeleted += part[1].split('\n').length - 1;
            }
        });

        // Initialize a new MergeView
        const mergeViewInstance = CodeMirror.MergeView(diffView, {
            value: text2,
            orig: text1,
            lineNumbers: true,
            mode: "text/plain",
            theme: "material",
            readOnly: true, // Prevent editing in the diff view
            highlightDifferences: true, // Highlight changes
            connect: false, // Disable merging
            collapseIdentical: false,
            allowInsertionMerge: false, // Disable insertion merging
            allowRemovalMerge: false, // Disable removal merging
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            lineWrapping: true,
        });

        // Display the diff container
        diffContainer.classList.remove('hidden');

        // Update summary counts
        document.getElementById('linesAdded').textContent = linesAdded;
        document.getElementById('linesDeleted').textContent = linesDeleted;

        // Scroll to the diff view smoothly
        diffContainer.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        alert("An error occurred during comparison. Please try again.\n\n" + error.message);
        console.error("Comparison Error:", error);
    }
}
