import {ref} from 'vue';

export function useBool() {
  const value = ref(false);
  const toggle = () => {
    value.value = !value.value;
  };
  const on = () => {
    value.value = true;
  };
  const off = () => {
    value.value = false;
  };
  return {value, toggle, on, off};
}
