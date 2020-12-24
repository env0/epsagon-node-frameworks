const express = require('express');
const epsagon = require('../src/index');

epsagon.init({
    appName: 'my-app-name',
    metadataOnly: false,
});

const app = express()

app.get('/', (req, res) => res.send('Hello World!'))

app.get('/label_example', (req, res) => {
    // Example label usage
    req.epsagon.label('myFirstLabel', 'customValue1');
    res.send('Hello World!')
})


app.listen(3000)