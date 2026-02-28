<script lang="ts">
  import { Button, Dropdown, DropdownItem } from 'flowbite-svelte';
  import { ChevronDownOutline } from 'flowbite-svelte-icons';

  import type { ChatAgent } from './chat-types';

  interface Props {
    messageInput: string;
    inputPlaceholder: string;
    sending: boolean;
    saving: boolean;
    saveEnabled: boolean;
    saveButtonLabel: string;
    showAgentSelector: boolean;
    selectedAgent: ChatAgent;
    onInput: (value: string) => void;
    onSend: () => void;
    onSave: () => void;
    onSelectAgent: (agent: ChatAgent) => void;
  }

  let {
    messageInput,
    inputPlaceholder,
    sending,
    saving,
    saveEnabled,
    saveButtonLabel,
    showAgentSelector,
    selectedAgent,
    onInput,
    onSend,
    onSave,
    onSelectAgent,
  }: Props = $props();

  let isAgentPickerOpen = $state(false);

  function sendMessage(event: SubmitEvent): void {
    event.preventDefault();
    onSend();
  }

  function handleInputKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    onSend();
  }

  function selectAgent(agent: ChatAgent): void {
    onSelectAgent(agent);
    isAgentPickerOpen = false;
  }
</script>

<form
  onsubmit={sendMessage}
  class="stacked-chat-font mt-2 grid gap-2.5 border-t stacked-divider pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-3 sm:grid-cols-[1fr_auto] sm:gap-3 sm:pt-4"
>
  <textarea
    value={messageInput}
    oninput={(event) =>
      onInput((event.currentTarget as HTMLTextAreaElement).value)}
    onkeydown={handleInputKeydown}
    rows="3"
    placeholder={inputPlaceholder}
    class="rounded-xl border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-[0.95rem] text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)]"
  ></textarea>
  <div class="flex flex-col gap-2 sm:items-stretch">
    <Button
      type="submit"
      size="sm"
      color="primary"
      disabled={sending || saving}
      loading={sending}
    >
      Send
    </Button>
    {#if saveEnabled}
      <Button
        type="button"
        size="sm"
        outline
        color="emerald"
        onclick={onSave}
        disabled={sending || saving}
        loading={saving}
      >
        {saveButtonLabel}
      </Button>
    {/if}
    {#if showAgentSelector}
      <Button
        id="agent-picker-trigger"
        type="button"
        size="sm"
        color="alternative"
        class="w-full justify-between"
        disabled={sending || saving}
        aria-label="Select agent"
      >
        Agent: {selectedAgent === 'plan' ? 'Plan' : 'Build'}
        <ChevronDownOutline class="h-6 w-6 text-white dark:text-white" />
      </Button>
      <Dropdown
        triggeredBy="#agent-picker-trigger"
        bind:isOpen={isAgentPickerOpen}
        simple
      >
        <DropdownItem onclick={() => selectAgent('plan')}>Plan</DropdownItem>
        <DropdownItem onclick={() => selectAgent('build')}>Build</DropdownItem>
      </Dropdown>
    {/if}
  </div>
  <p class="text-xs stacked-subtle sm:col-span-2">
    Enter for new line, Cmd/Ctrl+Enter to send
  </p>
</form>
