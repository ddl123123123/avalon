import { useState, type ComponentPropsWithoutRef } from 'react';

type ImageProps = Omit<ComponentPropsWithoutRef<'img'>, 'src' | 'onLoad'> & { src: string };

export function DecodedImage(props: ImageProps) {
  return <ImageWithDecode key={props.src} {...props} />;
}

function ImageWithDecode({ style, ...props }: ImageProps) {
  const [decoded, setDecoded] = useState(false);

  return (
    <img
      {...props}
      style={decoded ? style : { ...style, visibility: 'hidden' }}
      onLoad={async ({ currentTarget: img }) => {
        try {
          await img.decode?.();
          if (img.isConnected) setDecoded(true);
        } catch {
          // 解码失败时继续显示容器的底图。
        }
      }}
    />
  );
}
