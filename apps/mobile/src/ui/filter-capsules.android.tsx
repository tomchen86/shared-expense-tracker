import { useState, type ReactNode } from 'react';
import {
  FilterChip,
  Icon,
  ModalBottomSheet,
  OutlinedTextField,
  Row,
  Text,
} from '@expo/ui/jetpack-compose';
import {
  fillMaxWidth,
  padding,
  semantics,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import arrowDropDown from './arrow_drop_down.xml';
import { capsuleName, type CapsuleProps } from './capsule';
import type { AmountCapsuleProps, CapsuleMenuProps } from './filter-capsules';
import {
  MaterialHost,
  MaterialLabel,
  useTextWithCaretAtEnd,
} from './material.android';
import { MaterialMenu } from './material-menu.android';

export function CapsuleButton({
  label,
  value,
  text,
  selected,
  onPress,
  children,
}: CapsuleProps & { onPress: () => void; children?: ReactNode }) {
  const checked = selected ?? Boolean(value);
  const name = capsuleName({ label, value });
  return (
    <MaterialHost matchContents>
      <FilterChip
        selected={checked}
        modifiers={[semantics({ contentDescription: name })]}
        onClick={onPress}
      >
        <FilterChip.Label>
          <MaterialLabel
            accessibilityLabel={name}
            accessibilityState={{ checked }}
            color={checked ? 'onSecondaryContainer' : 'onSurface'}
          >
            {text || value || label}
          </MaterialLabel>
        </FilterChip.Label>
        {selected === undefined && (
          <FilterChip.TrailingIcon>
            <Icon source={arrowDropDown} size={18} />
          </FilterChip.TrailingIcon>
        )}
      </FilterChip>
      {children}
    </MaterialHost>
  );
}

export function CapsuleMenu(props: CapsuleMenuProps) {
  return (
    <MaterialMenu {...props}>
      {(open) => (
        <CapsuleButton
          label={props.label}
          value={props.value}
          text={props.text}
          onPress={open}
        />
      )}
    </MaterialMenu>
  );
}

export function AmountCapsule({
  label,
  value,
  min,
  max,
  onAmount,
  onPresented,
}: AmountCapsuleProps) {
  const [open, setOpen] = useState(false);
  function present(next: boolean) {
    setOpen(next);
    onPresented(next);
  }
  return (
    <CapsuleButton label={label} value={value} onPress={() => present(true)}>
      {open && (
        <ModalBottomSheet
          skipPartiallyExpanded
          onDismissRequest={() => present(false)}
        >
          <Row
            modifiers={[fillMaxWidth(), padding(20, 0, 20, 20)]}
            horizontalArrangement={{ spacedBy: 8 }}
            verticalAlignment="center"
          >
            <AmountField
              label="Lowest amount"
              placeholder="Min"
              initial={min}
              autoFocus
              onChange={(text) => onAmount('min', text)}
            />
            <Text>–</Text>
            <AmountField
              label="Highest amount"
              placeholder="Max"
              initial={max}
              onChange={(text) => onAmount('max', text)}
            />
          </Row>
        </ModalBottomSheet>
      )}
    </CapsuleButton>
  );
}

function AmountField({
  label,
  placeholder,
  initial,
  autoFocus,
  onChange,
}: {
  label: string;
  placeholder: string;
  initial: string;
  autoFocus?: boolean;
  onChange: (text: string) => void;
}) {
  const field = useTextWithCaretAtEnd(initial);
  return (
    <OutlinedTextField
      {...field}
      autoFocus={autoFocus}
      singleLine
      keyboardOptions={{
        keyboardType: 'decimal',
        imeAction: autoFocus ? 'next' : 'done',
      }}
      modifiers={[weight(1), semantics({ contentDescription: label })]}
      onValueChange={onChange}
    >
      <OutlinedTextField.Placeholder>
        <Text>{placeholder}</Text>
      </OutlinedTextField.Placeholder>
    </OutlinedTextField>
  );
}
