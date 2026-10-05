import { streamChat } from '../lib/claude';

(async () => {
  for await (const chunk of streamChat({
    systemPrompt: 'Responde brevemente en una sola palabra.',
    messages: [{ role: 'user', content: 'Hola, ¿funciona?' }],
  })) {
    process.stdout.write(chunk);
  }
  console.log('\n--- done ---');
})();
