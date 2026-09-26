# SillyTavern Language Learning Tutor

An interactive language learning assistant for SillyTavern. It places a dedicated language study bar above your chatbox, helps you formulate conversational expressions, provides Multiple-Choice (MCQ) reply options, and writes in-character responses in your target language.

---

## Features

- **Dedicated Learning Bar**: Injected right above the SillyTavern chat input box. Collapsible and non-intrusive.
- **Thought-to-Expression Translation**:
  - Type what you want to say in your native language (e.g. English, Vietnamese, etc.).
  - The model translates it into authentic spoken dialogue in your target language (Japanese, Spanish, French, Korean, Chinese, German, etc.).
  - Displays phonetic readings (Romaji, Pinyin), literal translations, and grammar/nuance tips.
- **Multiple Choice Options (MCQ)**:
  - Generates 3 to 4 distinct conversational options based on what the character just said.
  - Diverse tones: polite, casual, playful, inquisitive, empathetic.
  - Click to preview in the study box or send directly!
- **"Write for Me" (Impersonate)**:
  - Formulates an authentic in-character response for you in the target language with full pronunciation guide and explanation.
- **Active Learning Practice**:
  - Keep the target expression in view while you practice typing it into the chatbox yourself.
  - Or use the **"Fill Chatbox"** button to paste it with one click.
  - **Speech Audio**: Listen to natural pronunciation using browser speech synthesis.

---

## Installation

### Method 1: SillyTavern Extension Manager (URL Install)
1. Open the **Extensions** menu in SillyTavern (stacked cubes icon).
2. Click **Install Extension**.
3. Paste the repository URL:
   ```
   https://github.com/dkchw/SillyTavern-Language-Learning
   ```
4. Click **Save** and reload SillyTavern.

### Method 2: Manual Git Clone
Clone into your SillyTavern `third-party` extensions folder:
```bash
cd SillyTavern/public/scripts/extensions/third-party/
git clone https://github.com/dkchw/SillyTavern-Language-Learning.git
```

---

## Slash Commands

- `/language-mcq` (`/langmcq`): Generate Multiple-Choice reply suggestions in the current chat.
- `/language-impersonate` (`/langwrite`): Formulate an in-character response in your target language.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
