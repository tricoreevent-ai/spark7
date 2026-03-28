// Keep the production bootstrap minimal so the compiled server can run
// without depending on tsconfig files being present at runtime.
import './app.js';

console.log('App imported via bootstrap');
