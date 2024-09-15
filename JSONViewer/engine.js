/* JSONViewer/engine.js */

// Existing variables
let isExpandedBox1 = false;
let isExpandedBox2 = false;

// New variables to hold CodeMirror instances
let editor1, editor2;

// Initialize CodeMirror instances after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    editor1 = CodeMirror.fromTextArea(document.getElementById('jsonInput1'), {
        mode: { name: "javascript", json: true },
        lineNumbers: true,
        theme: "material", // Ensure this matches the theme you included
        tabSize: 2,
        indentWithTabs: false,
        lineWrapping: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        readOnly: false,
    });

    editor2 = CodeMirror.fromTextArea(document.getElementById('jsonInput2'), {
        mode: { name: "javascript", json: true },
        lineNumbers: true,
        theme: "material",
        tabSize: 2,
        indentWithTabs: false,
        lineWrapping: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        readOnly: false,
    });

    // Synchronize scroll positions between CodeMirror and view areas
    function syncScroll(editor, viewAreaId) {
        editor.on('scroll', () => {
            const scrollInfo = editor.getScrollInfo();
            const viewArea = document.getElementById(viewAreaId);
            if (viewArea) {
                viewArea.scrollTop = scrollInfo.top;
                viewArea.scrollLeft = scrollInfo.left;
            }
        });
    }

    syncScroll(editor1, 'view1');
    syncScroll(editor2, 'view2');
});

function beautifyJSON(textareaId) {
    let editor;
    let viewAreaId;

    if (textareaId === 'jsonInput1') {
        editor = editor1;
        viewAreaId = 'view1';
    } else if (textareaId === 'jsonInput2') {
        editor = editor2;
        viewAreaId = 'view2';
    } else {
        alert("Invalid textarea ID.");
        return;
    }

    const jsonText = editor.getValue().trim();

    if (jsonText === "") {
        alert("Please enter some JSON data to beautify.");
        return;
    }

    try {
        const jsonObj = JSON.parse(jsonText);
        const beautifiedJson = JSON.stringify(jsonObj, null, 4);
        editor.setValue(beautifiedJson);

        // If in text view, update the view
        const viewArea = document.getElementById(viewAreaId);
        if (viewArea.classList.contains('text-view')) {
            viewArea.textContent = beautifiedJson;
        }
    } catch (error) {
        alert("Invalid JSON format. Please correct the errors and try again.\n\n" + error.message);
    }
}

function viewJSON(textareaId, viewType) {
    let editor;
    let viewAreaId;

    if (textareaId === 'jsonInput1') {
        editor = editor1;
        viewAreaId = 'view1';
    } else if (textareaId === 'jsonInput2') {
        editor = editor2;
        viewAreaId = 'view2';
    } else {
        alert("Invalid textarea ID.");
        return;
    }

    const jsonText = editor.getValue().trim();

    if (jsonText === "") {
        alert("Please enter some JSON data to view.");
        return;
    }

    try {
        const jsonObj = JSON.parse(jsonText);

        const viewArea = document.getElementById(viewAreaId);

        switch (viewType) {
            case 'text':
                // Show the view area with beautified JSON
                viewArea.style.display = 'block';
                viewArea.className = 'view-area text-view';
                viewArea.textContent = JSON.stringify(jsonObj, null, 4);
                // Ensure CodeMirror editor is visible
                editor.getWrapperElement().style.display = 'block';
                break;
            case 'tree':
                // Hide CodeMirror editor and show tree view
                editor.getWrapperElement().style.display = 'none';
                viewArea.style.display = 'block';
                viewArea.className = 'view-area tree-view';
                viewArea.innerHTML = generateTreeView(jsonObj);
                break;
            case 'table':
                // Hide CodeMirror editor and show table view
                editor.getWrapperElement().style.display = 'none';
                viewArea.style.display = 'block';
                viewArea.className = 'view-area table-view';
                viewArea.innerHTML = generateTableView(jsonObj);
                break;
            case 'compact':
                // Hide CodeMirror editor and show compact view
                editor.getWrapperElement().style.display = 'none';
                viewArea.style.display = 'block';
                viewArea.className = 'view-area compact-view';
                viewArea.textContent = JSON.stringify(jsonObj);
                break;
            default:
                // If an unknown viewType is selected, reset to default
                editor.getWrapperElement().style.display = 'block';
                viewArea.style.display = 'none';
                break;
        }
    } catch (error) {
        alert("Invalid JSON format. Please correct the errors and try again.\n\n" + error.message);
    }
}

function generateTreeView(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return `<span>${escapeHTML(obj)}</span>`;
    }

    let html = '<ul>';

    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            html += '<li>';
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                html += `<strong>${escapeHTML(key)}:</strong> ${generateTreeView(obj[key])}`;
            } else {
                html += `<strong>${escapeHTML(key)}:</strong> ${escapeHTML(obj[key])}`;
            }
            html += '</li>';
        }
    }

    html += '</ul>';
    return html;
}

function generateTableView(obj) {
    if (Array.isArray(obj)) {
        // Check if array elements are objects
        if (obj.length === 0) {
            return '<p>Empty Array</p>';
        }

        const allObjects = obj.every(item => typeof item === 'object' && item !== null && !Array.isArray(item));

        if (!allObjects) {
            return '<p>Table view is only available for arrays of objects.</p>';
        }

        // Get all unique keys
        const keys = new Set();
        obj.forEach(item => {
            Object.keys(item).forEach(key => keys.add(key));
        });

        const headers = Array.from(keys);

        let html = '<table>';
        // Table headers
        html += '<thead><tr>';
        headers.forEach(header => {
            html += `<th>${escapeHTML(header)}</th>`;
        });
        html += '</tr></thead>';

        // Table body
        html += '<tbody>';
        obj.forEach(item => {
            html += '<tr>';
            headers.forEach(header => {
                html += `<td>${item[header] !== undefined ? escapeHTML(item[header]) : ''}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>';

        return html;
    } else {
        return '<p>Table view is only available for arrays of objects.</p>';
    }
}

function toggleExpand(boxId) {
    const box1 = document.getElementById('jsonBox1');
    const box2 = document.getElementById('jsonBox2');

    if (boxId === 'jsonBox1') {
        if (isExpandedBox1) {
            // Reset to default
            box1.classList.remove('expanded');
            box2.classList.remove('collapsed');
            isExpandedBox1 = false;
        } else {
            // Expand box1 and collapse box2
            box1.classList.add('expanded');
            box2.classList.add('collapsed');
            isExpandedBox1 = true;
            isExpandedBox2 = false;
        }
    } else if (boxId === 'jsonBox2') {
        if (isExpandedBox2) {
            // Reset to default
            box2.classList.remove('expanded');
            box1.classList.remove('collapsed');
            isExpandedBox2 = false;
        } else {
            // Expand box2 and collapse box1
            box2.classList.add('expanded');
            box1.classList.add('collapsed');
            isExpandedBox2 = true;
            isExpandedBox1 = false;
        }
    }

    // Hide Diff View when toggling expansion
    const diffContainer = document.getElementById('diffContainer');
    if (diffContainer) {
        diffContainer.classList.add('hidden');
    }
}

function compareJSON() {
    const jsonText1 = editor1.getValue().trim();
    const jsonText2 = editor2.getValue().trim();
    const diffView = document.getElementById('diffView');
    const diffContainer = document.getElementById('diffContainer');

    if (jsonText1 === "" || jsonText2 === "") {
        alert("Both JSON inputs must be filled to perform a comparison.");
        return;
    }

    try {
        // Parse JSON to ensure validity
        const jsonObj1 = JSON.parse(jsonText1);
        const jsonObj2 = JSON.parse(jsonText2);

        // Beautify JSON for better diff readability
        const beautifiedJson1 = JSON.stringify(jsonObj1, null, 4);
        const beautifiedJson2 = JSON.stringify(jsonObj2, null, 4);

        // Clear previous MergeView instances
        diffView.innerHTML = '';

        // Initialize a new MergeView
        CodeMirror.MergeView(diffView, {
            value: beautifiedJson2,
            orig: beautifiedJson1,
            lineNumbers: true,
            mode: { name: "javascript", json: true },
            theme: "material",
            readOnly: true, // Prevent editing in the diff view
            highlightDifferences: true, // Highlight changes
            connect: false, // Disable merging
            collapseIdentical: false,
            allowInsertionMerge: false, // Disable insertion merging
            allowRemovalMerge: false, // Disable removal merging
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            // Optional: Adjust other settings as needed
        });

        // Display the diff container
        diffContainer.classList.remove('hidden');
        console.log("recached diff counter");

        // Scroll to the diff view
        diffContainer.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        alert("Invalid JSON format in one or both inputs. Please correct the errors and try again.\n\n" + error.message);
    }
}

function escapeHTML(str) {
    return String(str).replace(/&/g, "&amp;")
                      .replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;");
}

// New copyJSON function
function copyJSON(textareaId) {
    let editor;

    if (textareaId === 'jsonInput1') {
        editor = editor1;
    } else if (textareaId === 'jsonInput2') {
        editor = editor2;
    } else {
        alert("Invalid textarea ID.");
        return;
    }

    const jsonText = editor.getValue().trim();

    if (jsonText === "") {
        alert("There is no JSON data to copy.");
        return;
    }

    // Use the Clipboard API if available
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(jsonText).then(() => {
            alert("JSON copied to clipboard!");
        }).catch(err => {
            console.error("Failed to copy: ", err);
            alert("Failed to copy JSON.");
        });
    } else {
        // Fallback method using a temporary textarea
        const tempTextarea = document.createElement('textarea');
        tempTextarea.value = jsonText;
        // Make the textarea out of viewport
        tempTextarea.style.position = 'absolute';
        tempTextarea.style.left = '-9999px';
        document.body.appendChild(tempTextarea);
        tempTextarea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                alert("JSON copied to clipboard!");
            } else {
                alert("Failed to copy JSON.");
            }
        } catch (err) {
            console.error("Fallback: Oops, unable to copy", err);
            alert("Failed to copy JSON.");
        }

        document.body.removeChild(tempTextarea);
    }
}
