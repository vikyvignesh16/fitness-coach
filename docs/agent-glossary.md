# Agent glossary

Words from the agent lessons, in plain language. It grows with each lesson.

* **Agent**: a model in a loop. It reads the situation, picks an action (answer, or call a tool), sees the result, and repeats until it can answer.
* **Workflow**: a fixed recipe written in code, with a model call at some steps. Use it when you know the steps in advance.
* **Framework**: ready made parts for building agents (the loop, memory, tools, hooks, tracing). We use Google ADK.
* **Model**: the part that turns text in into text out. Here a GPT model reached through OpenRouter. It only asks for things. Our code does them.
* **Instructions** (system prompt): who the agent is and how it must behave. Instructions help, but they are not a safety limit. Limits live in code.
* **Token**: a small piece of text, roughly three quarters of a word. Models charge per token, input and output separately.
* **LlmAgent** (ADK): the model, its instructions and its tools bundled together.
* **Runner** (ADK): the engine that runs the loop.
* **Session** (ADK): one conversation and its history.
* **Callback** (ADK): our own function that ADK runs before or after a step. `before_model_callback` can stop a model call. `after_model_callback` sees the result. This is where the spending cap lives.
* **Thought part**: the model's private reasoning summary, marked in the reply. Not shown to the user.
* **Receipt** (llm_calls row): one line per model call with tokens and cost. Never the question or answer.
* **Cap**: the most we spend in a month on model calls. A plain tested function, checked before each call.
* **Structured output** (output schema): a fixed form the model must fill in, written as a Pydantic class. ADK passes the shape to the model, and we check the reply against the same class.
* **Pydantic**: a Python library where a class lists fields and their rules (type, length, allowed words). It validates data and gives plain error messages.
* **Validation**: checking that a reply fits the form. It checks the shape, not whether the content is true.
* **Silent failure**: the program runs and the answer looks fine but is wrong, such as lost history or a confident wrong claim. Worse than a loud crash, because nobody notices.
* **Coroutine**: what an async function gives back when you call it without await. A recipe card that nobody cooked.
