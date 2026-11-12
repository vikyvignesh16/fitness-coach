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
* **Tool**: a plain function the model may ask for. The model never runs it. Our code does, so our code decides what is allowed. ADK shows the model the function's name, docstring and type hints, so a clear docstring is part of the tool.
* **Event**: one recorded step of the loop: the model asks for a tool, our code runs it, the model answers. Printing events is how you debug an agent.
* **Round**: one trip through the loop (model, then maybe tool). We cap the rounds, because a loop with no limit can run up a bill.
* **Grounding**: giving the model real data through a tool, so it reads numbers instead of guessing them. It lowers hallucination but does not remove it.
* **Dependency injection**: passing a part in from outside (here, the function that reads data) so tests and demos can swap in a fake.
* **Parallel tool calls**: a model may ask for several tools in one turn. ADK delivers them in one event and runs them together. A printout that shows only the first one hides what really happened.
* **Tool registry**: one list of every tool the agent may use, with the tables each one reads. To govern the agent you review this list. A shared test checks every tool in it against the design rules.
* **Flag**: a fact about one number that code worked out, like "slept under 6 hours". Facts only, never advice.
* **Drift guard**: a test that fails if two copies of the same rule (here the Python and TypeScript flag limits) stop matching.
* **Short term memory**: the back and forth of one conversation, stored in chat_messages (grouped by chat_threads). Only the newest 20 messages go back to the model each turn, so cost stays steady.
* **Long term memory**: short facts Vicky asked the coach to remember, stored in coach_memory (max 50 facts, 200 characters each). All of them go into every prompt, inside a fence that labels them as data.
* **Seeding a session**: filling a fresh ADK session with our saved messages at the start of each turn. The model remembers nothing between calls, so we rebuild what it knows every time.
* **Instruction provider**: an instruction written as a function. ADK treats a plain text instruction as a template and fills {placeholders} from session state. A function skips that, which keeps {braces} inside remembered facts harmless.
* **Gate** (before_tool_callback): our code that runs before a tool and can refuse it. The save_memory gate refuses the tool unless the user's message asks to remember something.
* **Scripted model**: a fake model that plays back prepared replies and records what it was sent. It lets a whole chat turn be tested for free.
* **Approved writes list**: the short list in the rules test of which tools may change data and which tables. Adding a write power means a human edits it.
* **RAG** (retrieval augmented generation): before the model answers, our code finds the most useful pieces of a library and puts them in front of it. The model reads the right pages each time instead of memorising the library.
* **Chunk**: a short piece of a document (at most 800 characters here) that keeps the heading it sat under. Small enough to match one idea.
* **Embedding**: a list of 1536 numbers that captures what a text means. Texts about the same thing get close numbers. Made by openai/text-embedding-3-small through OpenRouter, about $0.02 per million tokens.
* **Vector search**: finding the stored chunks whose numbers are closest to the question's numbers. Done by Postgres with pgvector, in the function match_library_chunks.
* **Grant versus policy**: a policy (Row Level Security) decides which rows a role sees. A grant decides whether a role may touch the table or function at all. Postgres lets everyone run a new function through the shared public grant, so revoke from public, not only from anon. Test the lock, not just the line that should close it.
* **Reference (ref)**: the short label for a library chunk, like lib:1a2b3c4d (the start of its id). The model cites it in square brackets. The id is never invented by the model, it comes from the search result.
* **Citation check**: a code check that every reference in an answer was really returned by a search in the same turn. It catches made up references. It does not catch a claim that has no citation at all. That needs its own check (lesson 7).
* **Retrieval test**: asking the search alone, with no chat model, a list of questions where we know the right chunk. It shows distances, so the limit can be set from facts. Cheaper and clearer than testing through the chat.
* **Over-refusal**: the model refusing to use something it was allowed to use. Our first library rule said samples were "not evidence" and the coach would not even explain the schema. Rules need to say what is allowed, not only what is forbidden.
* **Guardrail**: a plain code check around the model. Input guardrails (cap, tool rules, memory gate) limit what goes in. Output guardrails (lesson 7) check the answer before Vicky sees it. Code, not another model, so it is free, repeatable and cannot be talked round.
* **Worst case cost**: the most one turn could cost if every allowed model call ran as long as allowed and every tool result was as big as allowed. It needs a maximum reply length, otherwise there is no worst case. A turn starts only if spent plus worst case fits under the cap.
* **Tool call limit**: at most 6 tool requests per turn, then every further request is refused. A separate model call limit (8) ends a turn for good, so a model that loops cannot run up the bill.
* **Revision, then fallback**: if the checks fail, the problems go back to the model once. If the second answer fails too, a fixed safe message is shown. The code never edits the model's words.
* **Number grounding**: every number in an answer must be in a tool result, in what Vicky said, in her remembered facts, or in a few known facts (race date, goal times). A number counts if it is a correct rounding of one (7.8 for 7.83 hours). It proves a number exists in the data, not that it was used correctly, and a small number can match by coincidence.
* **Health claim check**: a word list finds sentences giving food, supplement or treatment advice. They must cite a returned reference of kind evidence. Sample references never count. Blunt on purpose, and it will miss claims in words it does not know.
* **Pain notice**: if the user mentions pain, code adds the fixed safety notice at the end of the answer when the model has not already said it. The model cannot forget it.
* **Prompt injection**: text in data (a library chunk, a remembered fact) that tries to give the model orders. Defences are layers: data is fenced and labelled, tools check their own inputs, and the save_memory gate is code that ignores what the model "wants".
* **Token (the "wristband")**: the proof of who you are that Supabase gives your phone when you sign in. It expires. The web app hands it to the coach service with each message. The service asks Supabase whose it is, and uses only that answer as the user id.
* **Private network**: Railway lets services in one project talk to each other by internal names (coach-api.railway.internal) that the internet cannot reach. The coach service has no public address at all, so strangers cannot knock. The token check is a second lock.
* **User client and service client**: two database connections inside the coach service. The user client carries your token, so Row Level Security limits every tool read to your rows. The service client uses the master key, only for what the tables reserve for the service (saving messages and facts, cost receipts, the cap), always stamped with the verified user id.
* **Kill switch**: COACH_ENABLED=false makes the coach service answer 503 and call no model. One setting stops all spending.
* **Rate limit**: at most 20 turns an hour per user, one at a time. A second brake behind the monthly cap.
* **Server action**: a function in the Next.js app that runs on the server when a button is pressed. It checks the login itself, because the browser can send anything.
* **Log hygiene**: error messages from model libraries can repeat what you sent. The coach service silences those libraries and logs only the error type.
