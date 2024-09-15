/* JSONViewer/engine.js */

let isExpandedBox1 = false;
let isExpandedBox2 = false;

function beautifyJSON(textareaId) {
    const textarea = document.getElementById(textareaId);
    const jsonText = textarea.value.trim();

    if (jsonText === "") {
        alert("Please enter some JSON data to beautify.");
        return;
    }

    try {
        const jsonObj = JSON.parse(jsonText);
        const beautifiedJson = JSON.stringify(jsonObj, null, 4);
        textarea.value = beautifiedJson;

        // If in text view, update the view
        const viewAreaId = textareaId === 'jsonInput1' ? 'view1' : 'view2';
        const viewArea = document.getElementById(viewAreaId);
        if (viewArea.classList.contains('text-view')) {
            viewArea.textContent = beautifiedJson;
        }
    } catch (error) {
        alert("Invalid JSON format. Please correct the errors and try again.\n\n" + error.message);
    }
}

function viewJSON(textareaId, viewType) {
    const textarea = document.getElementById(textareaId);
    const viewAreaId = textareaId === 'jsonInput1' ? 'view1' : 'view2';
    const viewArea = document.getElementById(viewAreaId);
    const jsonText = textarea.value.trim();

    if (jsonText === "") {
        alert("Please enter some JSON data to view.");
        return;
    }

    try {
        const jsonObj = JSON.parse(jsonText);
        // Hide textarea and show view area for non-text views
        if (viewType === 'text') {
            textarea.style.display = 'block';
            viewArea.style.display = 'block';
            viewArea.className = 'view-area text-view';
            viewArea.textContent = JSON.stringify(jsonObj, null, 4);
        } else {
            textarea.style.display = 'none';
            viewArea.style.display = 'block';
            if (viewType === 'tree') {
                viewArea.className = 'view-area tree-view';
                viewArea.innerHTML = generateTreeView(jsonObj);
            } else if (viewType === 'table') {
                viewArea.className = 'view-area table-view';
                viewArea.innerHTML = generateTableView(jsonObj);
            }
        }
    } catch (error) {
        alert("Invalid JSON format. Please correct the errors and try again.\n\n" + error.message);
    }
}

function generateTreeView(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return `<span>${obj}</span>`;
    }

    let html = '<ul>';

    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            html += '<li>';
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                html += `<strong>${key}:</strong> ${generateTreeView(obj[key])}`;
            } else {
                html += `<strong>${key}:</strong> ${obj[key]}`;
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
            html += `<th>${header}</th>`;
        });
        html += '</tr></thead>';

        // Table body
        html += '<tbody>';
        obj.forEach(item => {
            html += '<tr>';
            headers.forEach(header => {
                html += `<td>${item[header] !== undefined ? item[header] : ''}</td>`;
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
    diffContainer.style.display = 'none';
}

function compareJSON() {
    const textarea1 = document.getElementById('jsonInput1');
    const textarea2 = document.getElementById('jsonInput2');
    const diffView = document.getElementById('diffView');
    const diffContainer = document.getElementById('diffContainer');

    const jsonText1 = textarea1.value.trim();
    const jsonText2 = textarea2.value.trim();

    if (jsonText1 === "" || jsonText2 === "") {
        alert("Both JSON inputs must be filled to perform a comparison.");
        return;
    }

    try {
        const jsonObj1 = JSON.parse(jsonText1);
        const jsonObj2 = JSON.parse(jsonText2);

        const beautifiedJson1 = JSON.stringify(jsonObj1, null, 4);
        const beautifiedJson2 = JSON.stringify(jsonObj2, null, 4);

        const lines1 = beautifiedJson1.split('\n');
        const lines2 = beautifiedJson2.split('\n');

        const maxLength = Math.max(lines1.length, lines2.length);
        let diffHTML = '';

        for (let i = 0; i < maxLength; i++) {
            const line1 = lines1[i] || '';
            const line2 = lines2[i] || '';

            if (line1 === line2) {
                diffHTML += `<div><span>${escapeHTML(line1)}</span></div>`;
            } else {
                if (line1 && !lines2.includes(line1)) {
                    diffHTML += `<div class="deletion"><span>${escapeHTML(line1)}</span></div>`;
                }
                if (line2 && !lines1.includes(line2)) {
                    diffHTML += `<div class="addition"><span>${escapeHTML(line2)}</span></div>`;
                }
            }
        }

        // Handle lines that exist in one but not the other
        if (lines1.length > lines2.length) {
            for (let i = lines2.length; i < lines1.length; i++) {
                diffHTML += `<div class="deletion"><span>${escapeHTML(lines1[i])}</span></div>`;
            }
        } else if (lines2.length > lines1.length) {
            for (let i = lines1.length; i < lines2.length; i++) {
                diffHTML += `<div class="addition"><span>${escapeHTML(lines2[i])}</span></div>`;
            }
        }

        diffView.innerHTML = diffHTML;
        diffContainer.style.display = 'block';
        // Scroll to diff view
        diffContainer.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        alert("Invalid JSON format in one or both inputs. Please correct the errors and try again.\n\n" + error.message);
    }
}

function escapeHTML(str) {
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
}
