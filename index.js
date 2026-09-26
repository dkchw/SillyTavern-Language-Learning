const MODULE_NAME = 'language_learning_tutor';
const EXTENSION_DIR = 'third-party/SillyTavern-Language-Learning';

const defaultSettings = Object.freeze({
    targetLanguage: 'Japanese',
    nativeLanguage: 'English',
    formality: 'Natural / Contextual',
    level: 'Intermediate',
    showReading: true,
    showGrammar: true,
    showAudio: true,
    isMinimized: false,
});

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}

const langVoiceCodes = {
    'Japanese': 'ja-JP',
    'Spanish': 'es-ES',
    'French': 'fr-FR',
    'German': 'de-DE',
    'Chinese (Mandarin)': 'zh-CN',
    'Korean': 'ko-KR',
    'Russian': 'ru-RU',
    'Italian': 'it-IT',
    'Portuguese': 'pt-PT',
    'Vietnamese': 'vi-VN',
    'Arabic': 'ar-SA',
    'English': 'en-US',
};

function playSpeech(text, lang) {
    if (!('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langVoiceCodes[lang] || 'ja-JP';
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn('[Language Learning] Speech playback error:', e);
    }
}

// 1. Formulate user's intended thought into target language
async function formulateExpression(userIntent) {
    if (!userIntent || !userIntent.trim()) return null;

    const { generateRaw, characters, characterId, name1, name2 } = SillyTavern.getContext();
    const settings = getSettings();
    const charName = characters[characterId]?.data?.name || name2 || 'Partner';

    const systemPrompt = `You are a conversational language tutor helping a learner speak ${settings.targetLanguage}.
The user is having a roleplay/chat conversation with "${charName}".
User's native language: ${settings.nativeLanguage}.
Target language: ${settings.targetLanguage}.
Proficiency level: ${settings.level}.
Formality / Tone: ${settings.formality}.

The user will tell you what they want to say. Formulate natural, authentic spoken dialogue in ${settings.targetLanguage} suitable for this context.

Return ONLY a JSON object with this exact structure:
{
  "expression": "Natural spoken expression in ${settings.targetLanguage}",
  "reading": "Phonetic romanization or pronunciation reading (e.g. Romaji/Pinyin/IPA)",
  "translation": "Literal or direct meaning in ${settings.nativeLanguage}",
  "grammarNote": "Brief 1-sentence tip on key vocabulary, particles, or nuance"
}`;

    const prompt = `What I want to say to ${charName}: "${userIntent.trim()}"`;

    try {
        const rawJson = await generateRaw({
            prompt,
            systemPrompt,
            trimNames: false,
        });

        const match = rawJson.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return {
            expression: rawJson.trim(),
            reading: '',
            translation: userIntent,
            grammarNote: '',
        };
    } catch (error) {
        console.error('[Language Learning] Formulation error:', error);
        toastr.error('Failed to formulate expression. Check LLM connection.');
        return null;
    }
}

// 2. Generate Multiple Choice (MCQ) reply options based on active chat
async function generateMCQChoices() {
    const { generateQuietPrompt, characters, characterId, name1, name2 } = SillyTavern.getContext();
    const settings = getSettings();
    const charName = characters[characterId]?.data?.name || name2 || 'Partner';
    const userName = name1 || 'User';

    const quietInstruction = `[Language Learning Task]
Analyze the ongoing conversation above between ${charName} and ${userName}.
Create 3 or 4 distinct, engaging response options that ${userName} could say next to ${charName} in ${settings.targetLanguage}.
Each choice must represent a different tone or reaction (e.g. Polite Agreement, Playful Teasing, Inquisitive Question, Empathetic Reaction).
Learner level: ${settings.level}.
Learner native language: ${settings.nativeLanguage}.

Output ONLY a JSON array of objects with this schema:
[
  {
    "tone": "Brief tone tag (e.g. Polite, Playful, Curious, Concerned)",
    "expression": "Spoken sentence in ${settings.targetLanguage}",
    "reading": "Pronunciation / Romanization (Romaji, Pinyin, etc.)",
    "translation": "Meaning in ${settings.nativeLanguage}"
  }
]`;

    try {
        const rawResponse = await generateQuietPrompt({
            quietPrompt: quietInstruction,
            skipWIAN: true,
            responseLength: 450,
        });

        const match = rawResponse.match(/\[[\s\S]*\]/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return [];
    } catch (e) {
        console.error('[Language Learning] MCQ generation error:', e);
        toastr.error('Failed to generate MCQ suggestions.');
        return [];
    }
}

// 3. Impersonate: write in-character response in target language
async function generateImpersonatedReply() {
    const { generateQuietPrompt, characters, characterId, name1, name2 } = SillyTavern.getContext();
    const settings = getSettings();
    const charName = characters[characterId]?.data?.name || name2 || 'Partner';
    const userName = name1 || 'User';

    const quietInstruction = `[Language Learning Task]
Write the next in-character response for ${userName} replying to ${charName} in ${settings.targetLanguage}.
Target Language: ${settings.targetLanguage}.
Learner Level: ${settings.level}.
Formality: ${settings.formality}.
Native Language for explanation: ${settings.nativeLanguage}.

Return ONLY a JSON object:
{
  "expression": "In-character reply for ${userName} in ${settings.targetLanguage}",
  "reading": "Phonetic reading / romanization",
  "translation": "Translation in ${settings.nativeLanguage}",
  "grammarNote": "Brief nuance explanation"
}`;

    try {
        const rawResponse = await generateQuietPrompt({
            quietPrompt: quietInstruction,
            skipWIAN: true,
            responseLength: 350,
        });

        const match = rawResponse.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return {
            expression: rawResponse.trim(),
            reading: '',
            translation: '',
            grammarNote: '',
        };
    } catch (e) {
        console.error('[Language Learning] Impersonate error:', e);
        toastr.error('Failed to generate impersonated reply.');
        return null;
    }
}

// Display expression in study box
function displayStudyResult(data) {
    if (!data) return;
    const settings = getSettings();
    const resultBox = $('#st_lang_study_box');

    $('#st_lang_target_expr').text(data.expression || '');

    if (settings.showReading && data.reading) {
        $('#st_lang_reading_expr').text(data.reading).show();
    } else {
        $('#st_lang_reading_expr').hide();
    }

    if (data.translation) {
        $('#st_lang_trans_expr').text(`Meaning: ${data.translation}`).show();
    } else {
        $('#st_lang_trans_expr').hide();
    }

    if (settings.showGrammar && data.grammarNote) {
        $('#st_lang_grammar_expr').text(`Tip: ${data.grammarNote}`).show();
    } else {
        $('#st_lang_grammar_expr').hide();
    }

    if (settings.showAudio && data.expression) {
        $('#st_lang_play_audio').show();
    } else {
        $('#st_lang_play_audio').hide();
    }

    resultBox.slideDown(200);
}

// Render MCQ cards
function renderMCQCards(choices) {
    const container = $('#st_lang_mcq_list');
    container.empty();

    if (!Array.isArray(choices) || choices.length === 0) {
        container.hide();
        return;
    }

    choices.forEach((choice, index) => {
        const card = $(`
            <div class="st-lang-mcq-card" data-idx="${index}">
                <div class="st-lang-mcq-header">
                    <span class="st-lang-mcq-tone">${choice.tone || 'Option'}</span>
                    <button class="st-lang-action-btn st-lang-mcq-send-btn" title="Send now" style="padding: 1px 6px;">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
                <div class="st-lang-mcq-text">${choice.expression}</div>
                ${choice.reading ? `<div class="st-lang-mcq-sub" style="color: #ffb86c;">${choice.reading}</div>` : ''}
                ${choice.translation ? `<div class="st-lang-mcq-sub">${choice.translation}</div>` : ''}
            </div>
        `);

        card.on('click', function (e) {
            if ($(e.target).closest('.st-lang-mcq-send-btn').length) {
                $('#send_textarea').val(choice.expression).trigger('input');
                $('#send_but').trigger('click');
                container.slideUp(150);
                return;
            }

            displayStudyResult({
                expression: choice.expression,
                reading: choice.reading,
                translation: choice.translation,
                grammarNote: `Tone: ${choice.tone}`,
            });
        });

        container.append(card);
    });

    container.slideDown(200);
}

// Injects the Language Learning Bar directly above the SillyTavern chat send form
function injectLanguageBar() {
    if ($('#st_lang_learning_container').length) return;

    const sendForm = document.querySelector('#send_form');
    if (!sendForm || !sendForm.parentElement) return;

    const { saveSettingsDebounced } = SillyTavern.getContext();
    const settings = getSettings();

    const barHtml = `
    <div id="st_lang_learning_container" class="${settings.isMinimized ? 'minimized' : ''}">
        <div class="st-lang-top-bar">
            <div class="st-lang-badge" id="st_lang_toggle_bar" title="Click to minimize/expand">
                <i class="fa-solid fa-graduation-cap"></i>
                <span>Tutor</span>
                <span class="lang-tag" id="st_lang_active_label">${settings.nativeLanguage} &rarr; ${settings.targetLanguage}</span>
            </div>
            <div class="st-lang-top-actions">
                <button id="st_lang_mcq_btn" class="st-lang-action-btn" title="Suggest multiple-choice reply options">
                    <i class="fa-solid fa-list-check"></i> <span>MCQ Choices</span>
                </button>
                <button id="st_lang_impersonate_btn" class="st-lang-action-btn" title="Write a reply for me in target language">
                    <i class="fa-solid fa-user-pen"></i> <span>Write for Me</span>
                </button>
                <button id="st_lang_min_btn" class="st-lang-action-btn" style="padding: 4px 6px;" title="Minimize / Expand">
                    <i class="fa-solid ${settings.isMinimized ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
                </button>
            </div>
        </div>

        <div class="st-lang-body">
            <div class="st-lang-input-row">
                <input id="st_lang_intent_input" type="text" class="st-lang-intent-input" placeholder="Type what you want to say in your native language..." />
                <button id="st_lang_translate_btn" class="st-lang-action-btn" title="Formulate expression">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> <span>Translate</span>
                </button>
            </div>

            <div id="st_lang_study_box" class="st-lang-result-box" style="display: none;">
                <div id="st_lang_target_expr" class="st-lang-target-expression"></div>
                <div id="st_lang_reading_expr" class="st-lang-reading"></div>
                <div id="st_lang_trans_expr" class="st-lang-translation"></div>
                <div id="st_lang_grammar_expr" class="st-lang-grammar-note"></div>
                
                <div class="st-lang-result-actions">
                    <button id="st_lang_play_audio" class="st-lang-action-btn" title="Listen to pronunciation">
                        <i class="fa-solid fa-volume-high"></i> Listen
                    </button>
                    <button id="st_lang_copy_btn" class="st-lang-action-btn" title="Copy to clipboard">
                        <i class="fa-solid fa-copy"></i> Copy
                    </button>
                    <button id="st_lang_fill_chat_btn" class="st-lang-action-btn" title="Paste into chatbox to practice typing">
                        <i class="fa-solid fa-arrow-down"></i> Fill Chatbox
                    </button>
                    <button id="st_lang_send_now_btn" class="st-lang-action-btn" style="background: rgba(80, 250, 123, 0.2); color: #50fa7b; border-color: rgba(80, 250, 123, 0.4);" title="Paste and send immediately">
                        <i class="fa-solid fa-paper-plane"></i> Send
                    </button>
                </div>
            </div>

            <div id="st_lang_mcq_list" class="st-lang-mcq-container" style="display: none;"></div>
        </div>
    </div>
    `;

    $(barHtml).insertBefore(sendForm);

    const container = $('#st_lang_learning_container');
    const intentInput = $('#st_lang_intent_input');
    const minBtn = $('#st_lang_min_btn');

    const toggleMinimize = () => {
        const isMin = container.toggleClass('minimized').hasClass('minimized');
        settings.isMinimized = isMin;
        minBtn.find('i').attr('class', `fa-solid ${isMin ? 'fa-chevron-down' : 'fa-chevron-up'}`);
        saveSettingsDebounced();
    };

    minBtn.on('click', toggleMinimize);
    $('#st_lang_toggle_bar').on('click', toggleMinimize);

    const handleFormulate = async () => {
        const text = intentInput.val();
        if (!text || !text.trim()) return;

        const btn = $('#st_lang_translate_btn');
        btn.prop('disabled', true).find('i').attr('class', 'fa-solid fa-spinner fa-spin');

        try {
            const result = await formulateExpression(text);
            if (result) {
                displayStudyResult(result);
                $('#st_lang_mcq_list').slideUp(100);
            }
        } finally {
            btn.prop('disabled', false).find('i').attr('class', 'fa-solid fa-wand-magic-sparkles');
        }
    };

    $('#st_lang_translate_btn').on('click', handleFormulate);
    intentInput.on('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleFormulate();
        }
    });

    $('#st_lang_mcq_btn').on('click', async () => {
        const btn = $('#st_lang_mcq_btn');
        btn.prop('disabled', true).find('i').attr('class', 'fa-solid fa-spinner fa-spin');
        try {
            const choices = await generateMCQChoices();
            renderMCQCards(choices);
        } finally {
            btn.prop('disabled', false).find('i').attr('class', 'fa-solid fa-list-check');
        }
    });

    $('#st_lang_impersonate_btn').on('click', async () => {
        const btn = $('#st_lang_impersonate_btn');
        btn.prop('disabled', true).find('i').attr('class', 'fa-solid fa-spinner fa-spin');
        try {
            const result = await generateImpersonatedReply();
            if (result) {
                displayStudyResult(result);
                $('#st_lang_mcq_list').slideUp(100);
            }
        } finally {
            btn.prop('disabled', false).find('i').attr('class', 'fa-solid fa-user-pen');
        }
    });

    $('#st_lang_copy_btn').on('click', () => {
        const text = $('#st_lang_target_expr').text();
        if (text) {
            navigator.clipboard.writeText(text);
            toastr.info('Expression copied to clipboard.');
        }
    });

    $('#st_lang_fill_chat_btn').on('click', () => {
        const text = $('#st_lang_target_expr').text();
        if (text) {
            $('#send_textarea').val(text).trigger('input').focus();
        }
    });

    $('#st_lang_send_now_btn').on('click', () => {
        const text = $('#st_lang_target_expr').text();
        if (text) {
            $('#send_textarea').val(text).trigger('input');
            $('#send_but').trigger('click');
        }
    });

    $('#st_lang_play_audio').on('click', () => {
        const text = $('#st_lang_target_expr').text();
        if (text) {
            playSpeech(text, settings.targetLanguage);
        }
    });
}

(async function init() {
    const { renderExtensionTemplateAsync, saveSettingsDebounced, eventSource, eventTypes, SlashCommandParser, SlashCommand } = SillyTavern.getContext();

    // 1. Render Extension Settings Drawer
    try {
        const settings = getSettings();
        const settingsHtml = await renderExtensionTemplateAsync(EXTENSION_DIR, 'settings', settings);
        $('#extensions_settings').append(settingsHtml);

        $('#st_lang_target').val(settings.targetLanguage).on('change', function () {
            settings.targetLanguage = $(this).val();
            $('#st_lang_active_label').html(`${settings.nativeLanguage} &rarr; ${settings.targetLanguage}`);
            saveSettingsDebounced();
        });

        $('#st_lang_native').val(settings.nativeLanguage).on('change', function () {
            settings.nativeLanguage = $(this).val();
            $('#st_lang_active_label').html(`${settings.nativeLanguage} &rarr; ${settings.targetLanguage}`);
            saveSettingsDebounced();
        });

        $('#st_lang_formality').val(settings.formality).on('change', function () {
            settings.formality = $(this).val();
            saveSettingsDebounced();
        });

        $('#st_lang_level').val(settings.level).on('change', function () {
            settings.level = $(this).val();
            saveSettingsDebounced();
        });

        $('#st_lang_show_reading').prop('checked', settings.showReading).on('change', function () {
            settings.showReading = $(this).is(':checked');
            saveSettingsDebounced();
        });

        $('#st_lang_show_grammar').prop('checked', settings.showGrammar).on('change', function () {
            settings.showGrammar = $(this).is(':checked');
            saveSettingsDebounced();
        });

        $('#st_lang_show_audio').prop('checked', settings.showAudio).on('change', function () {
            settings.showAudio = $(this).is(':checked');
            saveSettingsDebounced();
        });
    } catch (e) {
        console.error('[Language Learning] Failed to render settings template:', e);
    }

    // 2. Inject Language Bar when app is ready or immediately if DOM is ready
    if (eventSource && eventTypes) {
        eventSource.on(eventTypes.APP_READY, injectLanguageBar);
    }
    injectLanguageBar();

    // 3. Register Slash Commands
    try {
        if (SlashCommandParser && SlashCommand) {
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'language-mcq',
                aliases: ['langmcq'],
                helpString: 'Generates multiple choice reply options in target language.',
                callback: async () => {
                    const choices = await generateMCQChoices();
                    renderMCQCards(choices);
                    return 'MCQ options generated.';
                },
            }));

            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name: 'language-impersonate',
                aliases: ['langwrite'],
                helpString: 'Writes an in-character reply in target language.',
                callback: async () => {
                    const res = await generateImpersonatedReply();
                    if (res) displayStudyResult(res);
                    return 'Expression generated.';
                },
            }));
        }
    } catch (e) {
        console.debug('[Language Learning] Slash command registration error:', e);
    }
})();
