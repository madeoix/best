<script>
  import '$lib/styles/beacon-foundation.css';

  let {
    label,
    tone = 'neutral',
    title = undefined,
    class: className = ''
  } = $props();
</script>

<span class={`bui-status-badge ${className}`} data-tone={tone} {title}>
  {label}
</span>
