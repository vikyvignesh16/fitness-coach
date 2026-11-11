"""The one tool that writes: save_memory. Kept in its own file so it is easy to review.

It cannot reach any table itself. It calls the save function it is given, and that function (add_fact) does all the checking.
"""
from typing import Callable

from coach.memory import MemoryRefused


def make_save_memory_tool(save_fact: Callable[[str], None]):
    def save_memory(fact: str) -> dict:
        """Remember one short fact about the runner for future chats. Use this ONLY when she clearly asks you to remember
        something, for example "remember that I prefer morning runs". Never save a fact on your own. Do not save watch
        numbers, health measurements or anything she did not ask to keep.

        Args:
            fact: The fact to remember, as one short sentence of at most 200 characters, with no line breaks.

        Returns:
            {"saved": true, "fact": ...} when it was saved, or {"error": ...} with the reason when it was refused.
        """
        if not isinstance(fact, str):
            return {"error": "fact must be a short piece of text."}
        try:
            save_fact(fact)
        except MemoryRefused as err:  # a refusal is a normal answer, so the model can read the reason and carry on
            return {"error": str(err)}
        return {"saved": True, "fact": fact.strip()}

    return save_memory
