import React, { useState, useEffect } from 'react';
import { Text, Transformer } from 'react-konva';

const EditableText = ({ shape, isSelected, onSelect, onChange }) => {
  const [textNode, setTextNode] = useState(null);
  const [transformer, setTransformer] = useState(null);

  useEffect(() => {
    if (isSelected && textNode && transformer) {
      transformer.nodes([textNode]);
      transformer.getLayer().batchDraw();
    }
  }, [isSelected, textNode, transformer]);

  const handleTextDblClick = () => {
    const textPosition = textNode.getAbsolutePosition();
    const stageBox = textNode.getStage().container().getBoundingClientRect();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    textarea.value = shape.text;
    textarea.style.position = 'absolute';
    textarea.style.top = `${stageBox.top + textPosition.y}px`;
    textarea.style.left = `${stageBox.left + textPosition.x}px`;
    textarea.style.width = `${textNode.width() * textNode.scaleX()}px`;
    textarea.style.height = `${textNode.height() * textNode.scaleY()}px`;
    textarea.style.fontSize = `${shape.fontSize * textNode.scaleX()}px`;
    textarea.style.border = '1px solid blue';
    textarea.style.padding = '0px';
    textarea.style.margin = '0px';
    textarea.style.overflow = 'hidden';
    textarea.style.background = 'none';
    textarea.style.outline = 'none';
    textarea.style.resize = 'none';
    textarea.style.lineHeight = textNode.lineHeight() || 1;
    textarea.style.fontFamily = shape.fontFamily;
    textarea.style.transformOrigin = 'left top';
    textarea.style.textAlign = shape.align || 'left';
    textarea.style.color = shape.fill;
    
    const rotation = textNode.rotation();
    let transform = '';
    if (rotation) {
      transform += `rotateZ(${rotation}deg)`;
    }
    textarea.style.transform = transform;
    
    textarea.focus();

    function removeTextarea() {
      textarea.parentNode.removeChild(textarea);
      window.removeEventListener('click', handleOutsideClick);
      
      onChange({
        ...shape,
        text: textarea.value
      });
    }

    function handleOutsideClick(e) {
      if (e.target !== textarea) {
        removeTextarea();
      }
    }

    textarea.addEventListener('keydown', (e) => {
      if (e.keyCode === 13 && !e.shiftKey) {
        removeTextarea();
      }
      if (e.keyCode === 27) {
        removeTextarea();
      }
    });

    setTimeout(() => {
      window.addEventListener('click', handleOutsideClick);
    });
  };

  return (
    <>
      <Text
        ref={(node) => setTextNode(node)}
        {...shape}
        draggable
        onClick={() => onSelect(shape.id)}
        onDblClick={handleTextDblClick}
        onDragEnd={(e) => {
          onChange({
            ...shape,
            x: e.target.x(),
            y: e.target.y()
          });
        }}
        onTransformEnd={(e) => {
          const node = textNode;
          onChange({
            ...shape,
            x: node.x(),
            y: node.y(),
            width: node.width() * node.scaleX(),
            height: node.height() * node.scaleY(),
            rotation: node.rotation(),
            scaleX: 1,
            scaleY: 1
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={(node) => setTransformer(node)}
          boundBoxFunc={(oldBox, newBox) => {
            newBox.width = Math.max(30, newBox.width);
            return newBox;
          }}
        />
      )}
    </>
  );
};

export default EditableText;
