async function convertYaml() {
    const filePath = document.getElementById('filePath').value;
    const outputElement = document.getElementById('output');

    try {
        const response = await fetch('http://localhost:6001/api/convert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filePath }),
        });

        const data = await response.json();
        outputElement.innerHTML = JSON.stringify(data, null, 2);
    } catch (error) {
        outputElement.innerHTML = `Error: ${error.message}`;
    }
}