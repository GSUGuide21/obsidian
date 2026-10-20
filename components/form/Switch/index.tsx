import { Checkbox, type SwitchCheckboxProps } from "../Checkbox";

export type SwitchProps = Omit<SwitchCheckboxProps, "type">;

/** An on/off switch: shorthand for <Checkbox type="switch">. */
export function Switch(props: SwitchProps) {
  return <Checkbox {...props} type="switch" />;
}

export default Switch;
